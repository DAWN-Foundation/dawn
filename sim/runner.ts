/**
 * Shared simulator harness primitives.
 *
 * - check / fail counters used by scenario drivers
 * - send / sendExpectFail / registerCredentialForIdempotent helpers
 * - bootProtocol(): boots bankrun, runs the one-shot
 *   `initialize_config` ix, returns the BootedProtocol.
 *
 * Lean access-domain build: no token bootstrap, no Raydium, no fee
 * accounts. Just Config (cold-admin authority) + the access-domain
 * model.
 */

import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { startAnchor, BanksClient, ProgramTestContext } from 'solana-bankrun'

import { DAWN_PROGRAM_ID } from './codec/program'
import { buildInitializeConfig } from './codec/encoders'
import { configPda } from './codec/pda'
import { Capture } from '../tools/capture/capture'
import { Expectation } from './expectations'

// ---------------------------------------------------------------------------
// Assertion plumbing
// ---------------------------------------------------------------------------

let passes = 0
let failures = 0

export function check(name: string, ok: boolean, detail?: string) {
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (ok) passes += 1
  else {
    failures += 1
    process.exitCode = 1
  }
}

export function summary(label: string) {
  console.log(`--- ${label}: ${passes} pass, ${failures} fail ---`)
}

// ---------------------------------------------------------------------------
// SOL-funding helper — every system transfer goes through the Capture so
// the trace stays atomic and the verifier can replay it.
// ---------------------------------------------------------------------------

export async function fund(
  capture: Capture,
  fundFrom: Keypair,
  recipient: PublicKey,
  sol: number,
  label: string,
) {
  const ix = SystemProgram.transfer({
    fromPubkey: fundFrom.publicKey,
    toPubkey: recipient,
    lamports: sol * LAMPORTS_PER_SOL,
  })
  const result = await capture.processTransaction(ix, [fundFrom])
  if (!result.ok) {
    failures += 1
    process.exitCode = 1
    throw new Error(`${label} failed: ${result.error}`)
  }
  passes += 1
  console.log(`[PASS] ${label} (fund ${sol} SOL)`)
}

// ---------------------------------------------------------------------------
// Transaction send helper — always routes through the Capture wrapper.
// ---------------------------------------------------------------------------

export async function send(
  capture: Capture,
  ix: TransactionInstruction,
  signers: Keypair[],
  label: string,
) {
  const result = await capture.processTransaction(ix, signers)
  if (!result.ok) {
    console.log(`[FAIL] ${label} — ${result.error}`)
    for (const log of result.logs) console.log(`         ${log}`)
    failures += 1
    process.exitCode = 1
    throw new Error(`${label} failed`)
  }
  console.log(`[PASS] ${label}`)
  passes += 1
}

/**
 * Submit a tx that we EXPECT to fail. Verifies the failure happened,
 * optionally that the error message contains an expected substring.
 * Records the failed tx in the trace (capture-side preserves failed
 * txs for `failed-tx-no-diff` and other invariants).
 */
export async function sendExpectFail(
  capture: Capture,
  ix: TransactionInstruction,
  signers: Keypair[],
  label: string,
  opts: { errorContains?: string } = {},
) {
  const result = await capture.processTransaction(ix, signers)
  if (result.ok) {
    console.log(`[FAIL] ${label} — expected tx to fail, but it succeeded`)
    failures += 1
    process.exitCode = 1
    throw new Error(`${label} unexpectedly succeeded`)
  }
  if (opts.errorContains) {
    const err = result.error ?? ''
    const log = (result.logs ?? []).join(' ')
    if (!err.includes(opts.errorContains) && !log.includes(opts.errorContains)) {
      console.log(
        `[FAIL] ${label} — failed (expected) but error did not contain '${opts.errorContains}'`,
      )
      console.log(`         error: ${err}`)
      for (const l of result.logs ?? []) console.log(`         ${l}`)
      failures += 1
      process.exitCode = 1
      throw new Error(`${label} failed with unexpected error`)
    }
  }
  console.log(`[PASS] ${label} (expected fail: ${result.error})`)
  passes += 1
}

/**
 * Outcome of an idempotent register_credential_for attempt.
 *
 *   - 'created'    — fresh tx succeeded, PDA written for the first time
 *   - 'idempotent' — tx failed (init constraint), PDA already exists,
 *                    on-chain sealed_payload byte-equals what we tried to
 *                    write. Safe to treat as success: same operation, no
 *                    state change between attempt and observed state.
 *   - 'conflict'   — tx failed, PDA exists, sealed_payload differs.
 *                    A previous tx wrote a *different* credential for the
 *                    same (access_domain, auth_method, customer) tuple.
 *                    Operator-api should NOT silently retry — escalate.
 */
export type IdempotentOutcome = 'created' | 'idempotent' | 'conflict'

/**
 * Submit a `register_credential_for` ix with idempotent retry semantics.
 *
 * This wraps the operator-api's expected behavior: the network may drop
 * the connection mid-flight, so the same logical operation may be
 * retried. The helper:
 *
 *   1. Tries the tx.
 *   2. On success, returns 'created'.
 *   3. On failure, fetches the credential PDA. If absent, the failure
 *      was something else entirely — re-throws. If present, byte-compares
 *      `sealed_payload` against `expectedSealedPayload`:
 *        - match    → 'idempotent' (operator-api treats as success)
 *        - mismatch → 'conflict' (real collision; surface as error)
 *
 * IMPORTANT — operator-api implementation requirement:
 *
 *   libsodium sealed-box envelopes are NON-DETERMINISTIC. Each call to
 *   `sealForRecipient(pk, plaintext)` uses a fresh random ephemeral
 *   keypair, so sealing the same PSK twice produces two different
 *   128-byte envelopes. To make retry idempotent, the operator-api MUST
 *   persist the envelope bytes locally (in a database write-ahead log
 *   keyed by customer_id) BEFORE submitting the tx, and re-submit the
 *   exact same bytes on retry. This helper assumes the caller has done
 *   that — it byte-compares against `expectedSealedPayload` which the
 *   caller is responsible for keeping stable across retry attempts.
 *
 *   PSK rotation (intentional change of a customer's PSK) is a separate
 *   operation; it would either close-and-recreate the credential, or
 *   use a future `update_credential_payload` ix. It is NOT what this
 *   helper handles — a "conflict" outcome here means an unintended
 *   collision, not a legitimate rotation.
 */
export async function registerCredentialForIdempotent(
  capture: Capture,
  banks: BanksClient,
  ix: TransactionInstruction,
  signers: Keypair[],
  expectedSealedPayload: Buffer,
  credentialPda: PublicKey,
  label: string,
): Promise<IdempotentOutcome> {
  const result = await capture.processTransaction(ix, signers)
  if (result.ok) {
    console.log(`[PASS] ${label} (created)`)
    passes += 1
    return 'created'
  }

  // Tx failed. Disambiguate: was it a duplicate (PDA already exists) or
  // some other failure?
  const acc = await banks.getAccount(credentialPda)
  if (!acc) {
    // Genuine failure — surface it.
    console.log(`[FAIL] ${label} — ${result.error} (no credential PDA exists; not an idempotent retry)`)
    for (const log of result.logs ?? []) console.log(`         ${log}`)
    failures += 1
    process.exitCode = 1
    throw new Error(`${label} failed`)
  }

  // PDA exists. Byte-compare sealed_payload.
  const { decodeCredential } = await import('./codec/decoders')
  const decoded = decodeCredential(Buffer.from(acc.data))
  if (decoded.sealedPayload.equals(expectedSealedPayload)) {
    console.log(`[PASS] ${label} (idempotent: PDA already has byte-equal sealed_payload)`)
    passes += 1
    return 'idempotent'
  }
  console.log(`[PASS] ${label} (conflict detected: existing sealed_payload differs)`)
  passes += 1
  return 'conflict'
}

// ---------------------------------------------------------------------------
// Protocol bootstrap (one shot)
// ---------------------------------------------------------------------------

export interface BootedProtocol {
  ctx: ProgramTestContext
  banks: BanksClient
  capture: Capture
  payer: Keypair // also the cold-admin authority on Config
  config: PublicKey
}

export interface BootOptions {
  scenarioName: string
  seed: number
  runsDir?: string
}

/**
 * A scenario is a self-contained business story. The runner takes care
 * of bootstrapping the protocol, calling `run` with a Capture handle,
 * and registering `expects` so they fire at scenario_end.
 *
 *   export const scenario: Scenario = {
 *     name: 'small-isp',
 *     seed: 42,
 *     expects: [...],
 *     run: async (cap, p) => { ... },
 *   };
 */
export interface Scenario {
  name: string
  seed: number
  expects: Expectation[]
  run: (capture: Capture, booted: BootedProtocol) => Promise<void>
  /** Optional override for runs/<dir>. Defaults to runs/<name>/. */
  runsDir?: string
}

/**
 * Single entrypoint that owns the lifecycle of a scenario:
 *   1. boot the protocol (Capture + bankrun + Genesis events)
 *   2. register the scenario's expectations
 *   3. invoke the scenario's run() callback
 *   4. close the trace (which runs expectations + writes snapshot)
 */
export async function runScenario(scenario: Scenario): Promise<void> {
  console.log(`--- scenario: ${scenario.name} ---`)
  const p = await bootProtocol({
    scenarioName: scenario.name,
    seed: scenario.seed,
    runsDir: scenario.runsDir,
  })
  p.capture.registerExpectations(scenario.expects)
  try {
    await scenario.run(p.capture, p)
  } finally {
    await p.capture.end()
    summary(scenario.name)
    console.log(`\ntrace:    ${p.capture.path}`)
    console.log(`snapshot: ${p.capture.snapshot}`)
  }
}

// Module-level retained reference for the program name. napi to
// solana-bankrun has an intermittent issue on Node 23 where short-lived
// inline string literals get GC'd between handoff and Rust read,
// producing "Possible bogus program name". Pinning the string here for
// the whole process avoids that.
const PROGRAM_NAME_DAWN = 'dawn'

export async function bootProtocol(opts: BootOptions): Promise<BootedProtocol> {
  const programs = [
    { name: PROGRAM_NAME_DAWN, programId: DAWN_PROGRAM_ID },
  ]
  ;(globalThis as any).__bankrun_programs = programs
  try { (globalThis as any).gc?.() } catch {}
  const ctx = await startAnchor('.', programs, [])
  const banks = ctx.banksClient
  const payer = ctx.payer

  const capture = new Capture(ctx, {
    scenarioName: opts.scenarioName,
    seed: opts.seed,
    runsDir: opts.runsDir,
  })
  // Cold-admin "foundation" actor = bankrun default payer.
  capture.declareActor('foundation', payer.publicKey)
  await capture.start()

  const [config] = configPda()

  await capture.event(
    'Protocol Genesis',
    {
      actor: 'foundation',
      description:
        'Cold admin initializes the protocol Config singleton. Sets the ' +
        'cold-admin authority that gates global operations like DeviceModel ' +
        'registration. One-shot.',
    },
    async () => {
      await send(
        capture,
        buildInitializeConfig({ caller: payer.publicKey, config }),
        [payer],
        'initialize_config',
      )
    },
  )

  return {
    ctx,
    banks,
    capture,
    payer,
    config,
  }
}
