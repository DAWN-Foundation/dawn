/**
 * Shared simulator harness primitives.
 *
 * - check / fail counters used by every milestone driver
 * - send(ctx, ix, signers) helper that builds + signs + processes a tx
 * - bootProtocol(): boots bankrun, creates a USD.tel mint, runs the
 *   one-time protocol bootstrap (init_token + init_fee_accounts +
 *   initialize_config), and returns all the addresses subsequent
 *   milestones need.
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
import {
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
} from '@solana/spl-token'

import {
  DAWN_PROGRAM_ID,
  METADATA_PROGRAM_ID,
  RAYDIUM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from './codec/program'
import {
  buildInitFeeAccounts,
  buildInitToken,
  buildInitializeConfig,
} from './codec/encoders'
import {
  configPda,
  daoDawnAccountPda,
  dawnMintPda,
  feePoolDawnAccountPda,
  medallionDawnAccountPda,
  tokenConfigPda,
  validatorDawnAccountPda,
} from './codec/pda'
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

// ---------------------------------------------------------------------------
// Protocol bootstrap (one shot)
// ---------------------------------------------------------------------------

export interface BootedProtocol {
  ctx: ProgramTestContext
  banks: BanksClient
  capture: Capture
  payer: Keypair
  // PDAs / mints created by the bootstrap
  tokenConfig: PublicKey
  dawnMint: PublicKey
  config: PublicKey
  stableMint: PublicKey
  feePool: PublicKey
  daoFeeAccount: PublicKey
  validatorFeeAccount: PublicKey
  medallionFeeAccount: PublicKey
  apiAuthority: PublicKey
  // raydium placeholders stored in Config (real pool wired up later)
  raydiumPlaceholders: {
    raydium: PublicKey
    raydiumAuthority: PublicKey
    raydiumConfig: PublicKey
    raydiumPool: PublicKey
    raydiumObservation: PublicKey
  }
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

// Module-level retained references for the program names. The napi
// boundary into solana-bankrun has an intermittent issue on Node 23
// where short-lived inline string literals get GC'd between handoff and
// Rust read, producing the random "Possible bogus program name" panic.
// Holding the strings as top-level constants pins them for the whole
// process so the panic doesn't fire.
const PROGRAM_NAME_DAWN = 'dawn'
const PROGRAM_NAME_RAYDIUM = 'raydium'
const PROGRAM_NAME_META = 'meta'

export async function bootProtocol(opts: BootOptions): Promise<BootedProtocol> {
  // Build the program list with retained strings. Stash the array in
  // globalThis so even if module-level retention isn't enough, this
  // process-lifetime reference is.
  const programs = [
    { name: PROGRAM_NAME_DAWN, programId: DAWN_PROGRAM_ID },
    { name: PROGRAM_NAME_RAYDIUM, programId: RAYDIUM_PROGRAM_ID },
    { name: PROGRAM_NAME_META, programId: METADATA_PROGRAM_ID },
  ]
  ;(globalThis as any).__bankrun_programs = programs
  // Force a GC pass (if --expose-gc is enabled) so memory is calm
  // before the napi handoff. Falls back silently otherwise.
  try { (globalThis as any).gc?.() } catch {}
  const ctx = await startAnchor('.', programs, [])
  const banks = ctx.banksClient
  const payer = ctx.payer

  const capture = new Capture(ctx, {
    scenarioName: opts.scenarioName,
    seed: opts.seed,
    runsDir: opts.runsDir,
  })
  // The DAWN authority is the bankrun default payer for this scenario.
  capture.declareActor('foundation', payer.publicKey)
  await capture.start()

  // Create USD.tel mint via raw SystemProgram + InitializeMint2.
  // The mint creation tx is two SPL/system instructions (not dawn) — capture
  // them anyway as `tick = -1` setup transactions, since we want a complete
  // record of state mutations. Wrapped in a setup event so the timeline
  // shows what happened even though no dawn ticks advance.
  const stableMintKp = Keypair.generate()
  const stableMint = stableMintKp.publicKey
  await capture.event(
    'Mint USD.tel stablecoin',
    {
      actor: 'foundation',
      description:
        'External setup: mint the USD.tel stablecoin (a 6-decimal SPL token) ' +
        'that DAWN plans charge their subscribers in. This is one-time test ' +
        'infrastructure — in production USD.tel is a real Solana SPL mint not ' +
        'created by the protocol.',
    },
    async () => {
    const rent = await banks.getRent()
    const lamports = Number(await rent.minimumBalance(BigInt(MINT_SIZE)))
    const createIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: stableMint,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    })
    const initIx = createInitializeMint2Instruction(
      stableMint,
      6,
      payer.publicKey,
      null,
    )
    const r1 = await capture.processTransaction(createIx, [payer, stableMintKp])
    if (!r1.ok) throw new Error(`stable mint createAccount failed: ${r1.error}`)
    const r2 = await capture.processTransaction(initIx, [payer])
    if (!r2.ok) throw new Error(`stable mint initializeMint2 failed: ${r2.error}`)
  })

  // PDAs
  const [tokenConfig] = tokenConfigPda()
  const [dawnMint] = dawnMintPda()
  const [config] = configPda()
  const [feePool] = feePoolDawnAccountPda()
  const [dao] = daoDawnAccountPda()
  const [validator] = validatorDawnAccountPda()
  const [medallion] = medallionDawnAccountPda()
  const callerDawnAta = getAssociatedTokenAddressSync(dawnMint, payer.publicKey)

  // The bootstrap is a single business-level event with two sub-events.
  const apiAuthority = Keypair.generate().publicKey
  const raydiumPlaceholders = {
    raydium: Keypair.generate().publicKey,
    raydiumAuthority: Keypair.generate().publicKey,
    raydiumConfig: Keypair.generate().publicKey,
    raydiumPool: Keypair.generate().publicKey,
    raydiumObservation: Keypair.generate().publicKey,
  }
  await capture.event(
    'Protocol Genesis',
    {
      actor: 'foundation',
      description:
        'The DAWN authority bootstraps the protocol: mints the DAWN governance ' +
        'token, creates the four fee-pool token accounts (DAO, validator, ' +
        'medallion, accumulator), and writes the Config PDA that records the ' +
        'fee schedule, API delegate, and Raydium swap pool. After Genesis, ' +
        'service providers can begin onboarding.',
    },
    async () => {
    await capture.event(
      'Mint protocol tokens',
      {
        description:
          'Initialise the DAWN SPL mint and the four fee-pool token accounts. ' +
          'init_token mints 1 billion DAWN to the bootstrap caller as the ' +
          'genesis supply; init_fee_accounts creates the four fee-pool PDAs ' +
          'whose authorities will be set when initialize_config runs.',
      },
      async () => {
      await send(
        capture,
        buildInitToken({
          caller: payer.publicKey,
          tokenConfig,
          dawnMint,
          callerDawnAccount: callerDawnAta,
        }),
        [payer],
        'init_token',
      )
      await send(
        capture,
        buildInitFeeAccounts({
          caller: payer.publicKey,
          tokenConfig,
          dawnMint,
          feePoolDawnAccount: feePool,
          daoDawnAccount: dao,
          validatorDawnAccount: validator,
          medallionDawnAccount: medallion,
        }),
        [payer],
        'init_fee_accounts',
      )
    })
    await capture.event(
      'Configure economics',
      {
        description:
          'Records the fee parameters (3% DAO, 3% validator, 9% medallion ' +
          'accumulator), the Raydium swap pool addresses, the API delegate, ' +
          'and the stable + DAWN mints into the Config PDA. This is the ' +
          'singleton account every later instruction reads to learn who is ' +
          'authorised and which pool to swap against.',
      },
      async () => {
      await send(
        capture,
        buildInitializeConfig(
          {
            caller: payer.publicKey,
            apiAuthority,
            config,
            tokenConfig,
            stableMint,
            dawnMint,
            feePoolDawnAccount: feePool,
            daoDawnAccount: dao,
            validatorDawnAccount: validator,
            medallionDawnAccount: medallion,
            ...raydiumPlaceholders,
          },
          { daoFee: 300n, validatorFee: 300n, medallionFee: 900n },
        ),
        [payer],
        'initialize_config',
      )
    })
  })

  return {
    ctx,
    banks,
    capture,
    payer,
    tokenConfig,
    dawnMint,
    config,
    stableMint,
    feePool,
    daoFeeAccount: dao,
    validatorFeeAccount: validator,
    medallionFeeAccount: medallion,
    apiAuthority,
    raydiumPlaceholders,
  }
}
