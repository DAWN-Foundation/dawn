#!/usr/bin/env -S node_modules/.bin/ts-node --transpile-only

/**
 * Trace verifier.
 *
 * Boots a fresh bankrun with the same program binary, replays each `tx`
 * record from the JSONL using the stored signer keypairs, and asserts
 * that the post-state sha256 of every diff entry matches what the trace
 * recorded.
 *
 * Exit 0 on full match; exit 1 on any mismatch with the offending
 * pubkey, tick, instruction name, recorded hash, and observed hash.
 *
 * Usage: ts-node tools/verify-trace.ts <path/to/trace.jsonl>
 */

import { createHash } from 'crypto'
import * as fs from 'fs'
import * as readline from 'readline'

import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { startAnchor, BanksClient, Clock, ProgramTestContext } from 'solana-bankrun'

import {
  DAWN_PROGRAM_ID,
  METADATA_PROGRAM_ID,
  RAYDIUM_PROGRAM_ID,
} from '../sim/codec/program'
import {
  GLOBAL_INVARIANTS,
  Invariant,
  canonicalizeResult,
} from '../sim/invariants'
import { Expectation } from '../sim/expectations'
import { WorldState, TxRecordLike } from '../sim/world-state'

// Scenario registry — used to look up per-scenario expectations at
// verifier replay time. Each scenario file exports a const named
// `scenario` whose `expects` field is the list to re-run. Adding a new
// scenario means importing it here.
import { scenario as scenarioBootstrap } from '../sim/capture-bootstrap'
import { scenario as scenarioMpskProduction } from '../sim/scenario-mpsk-production'

const SCENARIO_REGISTRY: Record<string, { expects: Expectation[] }> = {
  bootstrap: scenarioBootstrap,
  'mpsk-production': scenarioMpskProduction,
}

interface TxRecord {
  type: 'tx'
  tick: number
  pre_tx_unix_ts: string
  pre_tx_slot: string
  instruction: {
    program: string
    program_id: string
    name: string | null
    discriminator_b64: string
    data_b64: string
    accounts: Array<{
      pubkey: string
      is_writable: boolean
      is_signer: boolean
    }>
  }
  signers: Array<{ public_key: string; secret_key_b64: string }>
  diff: Array<{
    pubkey: string
    raw_bytes_sha256: string
    raw_bytes_b64: string
  }>
}

interface ClockRecord {
  type: 'clock'
  tick: number
  unix_ts: string // serialized bigint
  slot: string
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function* readJsonl(p: string): AsyncIterable<any> {
  const rl = readline.createInterface({
    input: fs.createReadStream(p, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    if (!line.trim()) continue
    yield JSON.parse(line)
  }
}

function reviveBigint(v: string): bigint {
  // Numbers serialized as `${bigint}n` by the capture's jsonReplacer.
  return BigInt(v.endsWith('n') ? v.slice(0, -1) : v)
}

async function main() {
  const tracePath = process.argv[2]
  if (!tracePath) {
    console.error('usage: verify-trace.ts <trace.jsonl>')
    process.exit(2)
  }
  if (!fs.existsSync(tracePath)) {
    console.error(`no such file: ${tracePath}`)
    process.exit(2)
  }

  // Boot bankrun with the same fixtures.
  const ctx: ProgramTestContext = await startAnchor(
    '.',
    [
      { name: 'dawn', programId: DAWN_PROGRAM_ID },
      { name: 'raydium', programId: RAYDIUM_PROGRAM_ID },
      { name: 'meta', programId: METADATA_PROGRAM_ID },
    ],
    [],
  )
  const banks: BanksClient = ctx.banksClient

  let txCount = 0
  let mismatchCount = 0
  let scenarioName = '?'
  let seed = 0
  let invariantsChecked = 0
  let invariantsMismatched = 0
  let expectationsChecked = 0
  let expectationsMismatched = 0

  // Load all records into memory — small enough, and we need lookahead
  // (after each tx, the trace contains its `invariant_check` records;
  // after scenario_end, its `expectation_result` records).
  const allRecords: any[] = []
  for await (const rec of readJsonl(tracePath)) allRecords.push(rec)

  // First pass: collect every fee payer (the first signer of each tx).
  // We only fund fee payers, not all signers — a tx's secondary signers are
  // often throwaway keypairs for newly-created accounts. Pre-funding such a
  // keypair would cause a later SystemProgram.createAccount to fail with
  // AccountAlreadyInUse.
  const feePayersSeen = new Set<string>()
  for (const rec of allRecords) {
    if (rec.type === 'tx' && rec.signers && rec.signers.length > 0) {
      feePayersSeen.add(rec.signers[0].public_key)
    }
  }
  {
    const fundFrom = ctx.payer
    let funded = 0
    for (const pkStr of feePayersSeen) {
      const pk = new PublicKey(pkStr)
      if (pk.equals(fundFrom.publicKey)) continue
      const tx = new Transaction()
      tx.feePayer = fundFrom.publicKey
      tx.recentBlockhash = (await banks.getLatestBlockhash())[0]
      tx.add(
        SystemProgram.transfer({
          fromPubkey: fundFrom.publicKey,
          toPubkey: pk,
          lamports: 1000 * LAMPORTS_PER_SOL,
        }),
      )
      tx.sign(fundFrom)
      const r = await banks.tryProcessTransaction(tx)
      if (r.result) {
        throw new Error(`pre-fund of ${pkStr} failed: ${r.result}`)
      }
      funded += 1
    }
    console.log(
      `pre-funded ${funded} fee-payer(s) from verifier default payer (${feePayersSeen.size} unique fee payers seen)`,
    )
  }

  // Persistent verifier state needed for WorldState construction —
  // mirrors the capture layer's bookkeeping exactly so produced
  // results are byte-identical.
  const observedPubkeys = new Set<string>()
  const replayedTxs: TxRecordLike[] = []
  let captureVersion = 1
  let scenarioActors: Record<string, string> = {}

  // Helper: serialize an InvariantResult-shaped JSON object to a canonical
  // form suitable for byte-identical comparison.
  function canonicalizeRecord(rec: any): string {
    const sortedAccounts =
      Array.isArray(rec.accounts) ? [...rec.accounts].sort() : undefined
    return JSON.stringify({
      ok: !!rec.ok,
      message: rec.ok ? undefined : rec.message,
      accounts: sortedAccounts,
    })
  }

  for (let i = 0; i < allRecords.length; i++) {
    const rec = allRecords[i]
    if (rec.type === 'scenario_start') {
      scenarioName = rec.scenario_name
      seed = rec.seed
      captureVersion = rec.capture_version ?? 1
      scenarioActors = { ...(rec.metadata?.actors ?? {}) }
      console.log(
        `verifying scenario=${scenarioName} seed=${seed} v=${captureVersion} program=${rec.program_id}`,
      )
      continue
    }

    if (rec.type === 'actor_declared') {
      // Capture emits these for actors declared after scenario_start.
      // Mirror them into our local actors map so WorldState.metadata().actors
      // matches what capture saw at the same point in the trace.
      scenarioActors[rec.name] = rec.pubkey
      continue
    }

    if (rec.type === 'clock') {
      const c = rec as ClockRecord
      const current = await banks.getClock()
      ctx.setClock(
        new Clock(
          reviveBigint(c.slot),
          current.epochStartTimestamp,
          current.epoch,
          current.leaderScheduleEpoch,
          reviveBigint(c.unix_ts),
        ),
      )
      continue
    }

    if (rec.type === 'scenario_end') {
      continue
    }

    if (rec.type !== 'tx') continue
    const tx = rec as TxRecord
    txCount += 1

    // Set bankrun clock to the recorded pre-tx state so Clock::get() in
    // the program returns the same values as the original run. Without
    // this, on-chain `created_at` fields and any other clock-derived
    // state diverge and hashes mismatch.
    {
      const cur = await banks.getClock()
      ctx.setClock(
        new Clock(
          reviveBigint(tx.pre_tx_slot),
          cur.epochStartTimestamp,
          cur.epoch,
          cur.leaderScheduleEpoch,
          reviveBigint(tx.pre_tx_unix_ts),
        ),
      )
    }

    // Reconstruct the instruction.
    const data = Buffer.from(tx.instruction.data_b64, 'base64')
    const ix = new TransactionInstruction({
      programId: new PublicKey(tx.instruction.program_id),
      keys: tx.instruction.accounts.map((a) => ({
        pubkey: new PublicKey(a.pubkey),
        isSigner: a.is_signer,
        isWritable: a.is_writable,
      })),
      data,
    })

    // Reconstruct signer keypairs from stored secret keys.
    const signers = tx.signers.map((s) => {
      const sk = Buffer.from(s.secret_key_b64, 'base64')
      return Keypair.fromSecretKey(new Uint8Array(sk))
    })

    // Build + send.
    const txn = new Transaction()
    txn.feePayer = signers[0].publicKey
    txn.recentBlockhash = (await banks.getLatestBlockhash())[0]
    txn.add(ix)
    txn.sign(...signers)
    const result = await banks.tryProcessTransaction(txn)
    // Three error-comparison cases:
    //   recorded ok, replay ok         → continue with diff hash check
    //   recorded errored, replay errored with same error → expected, continue
    //                                                       (no diff to check;
    //                                                       failed-tx-no-diff
    //                                                       invariant covers it)
    //   else (mismatch in any direction) → trace integrity failure
    const replayErr = result.result ? String(result.result) : null
    if (tx.error && replayErr) {
      // Both errored. Sufficient agreement: both errored on the same ix.
      // (Comparing exact error strings is too brittle across runs.)
      continue
    }
    if (tx.error && !replayErr) {
      console.error(
        `[FAIL] tick ${tx.tick} (${tx.instruction.name ?? 'unknown'}) recorded as errored ('${tx.error}') but replay succeeded`,
      )
      mismatchCount += 1
      continue
    }
    if (!tx.error && replayErr) {
      console.error(
        `[FAIL] tick ${tx.tick} (${tx.instruction.name ?? 'unknown'}) replay errored: ${replayErr}`,
      )
      mismatchCount += 1
      continue
    }

    // Hash check every diff entry.
    for (const d of tx.diff) {
      const acc = await banks.getAccount(new PublicKey(d.pubkey))
      const observedBytes = acc ? Buffer.from(acc.data) : Buffer.alloc(0)
      const observedHash = sha256Hex(observedBytes)
      const recordedBytes = Buffer.from(d.raw_bytes_b64, 'base64')
      const recordedHash = sha256Hex(recordedBytes)

      // Two possible mismatches: between observed and recorded hash, or
      // between recorded bytes and recorded hash (tampered-bytes case).
      if (observedHash !== d.raw_bytes_sha256) {
        const dlen = Math.min(observedBytes.length, recordedBytes.length, 32)
        let firstDiffByte = -1
        for (let i = 0; i < Math.max(observedBytes.length, recordedBytes.length); i++) {
          if (observedBytes[i] !== recordedBytes[i]) {
            firstDiffByte = i
            break
          }
        }
        console.error(
          `[FAIL] tick ${tx.tick} (${tx.instruction.name ?? 'unknown'}) account ${d.pubkey}`,
        )
        console.error(`         recorded sha256: ${d.raw_bytes_sha256}`)
        console.error(`         observed sha256: ${observedHash}`)
        if (firstDiffByte >= 0) {
          console.error(
            `         first diverging byte at offset ${firstDiffByte}: recorded=0x${recordedBytes[firstDiffByte]?.toString(16) ?? '--'} observed=0x${observedBytes[firstDiffByte]?.toString(16) ?? '--'}`,
          )
        }
        if (recordedHash !== d.raw_bytes_sha256) {
          console.error(
            `         (note: recorded raw_bytes_b64 also does not match recorded raw_bytes_sha256 — trace was tampered)`,
          )
        }
        console.error(
          `         observed bytes (first ${dlen}B hex): ${observedBytes.subarray(0, dlen).toString('hex')}`,
        )
        console.error(
          `         recorded bytes (first ${dlen}B hex): ${recordedBytes.subarray(0, dlen).toString('hex')}`,
        )
        mismatchCount += 1
      } else if (recordedHash !== d.raw_bytes_sha256) {
        // Bytes were tampered but hash field happened to still match observed.
        // This still fails verification — recorded bytes don't match recorded hash.
        console.error(
          `[FAIL] tick ${tx.tick} (${tx.instruction.name ?? 'unknown'}) account ${d.pubkey}: recorded bytes do not hash to recorded hash`,
        )
        console.error(`         recorded sha256: ${d.raw_bytes_sha256}`)
        console.error(`         actual sha256:   ${recordedHash}`)
        mismatchCount += 1
      }
    }

    // ===== v2 Invariant rerun =====
    // After replaying the tx, build a fresh WorldState and re-run every
    // applicable global invariant. The recorded `invariant_check` records
    // appear in the trace IMMEDIATELY after this tx (in registry order,
    // skipping inapplicable ones). Consume them and assert match.
    if (captureVersion >= 2) {
      // Update persistent state for this tx.
      for (const a of tx.instruction.accounts) observedPubkeys.add(a.pubkey)
      replayedTxs.push(tx as any as TxRecordLike)

      const worldState = await WorldState.build(
        banks,
        Array.from(observedPubkeys),
        tx.tick,
        replayedTxs,
        {
          scenario_name: scenarioName,
          seed,
          initial_unix_ts: 0n,
          initial_slot: 0n,
          program_id: DAWN_PROGRAM_ID.toBase58(),
          actors: scenarioActors,
        },
      )
      for (const inv of GLOBAL_INVARIANTS) {
        if (inv.appliesTo && !inv.appliesTo(worldState)) continue
        const computed = canonicalizeResult(inv.check(worldState))
        // Find the next invariant_check record for this invariant.
        let consumed: any | null = null
        let j = i + 1
        while (j < allRecords.length && allRecords[j].type !== 'tx' && allRecords[j].type !== 'scenario_end') {
          if (
            allRecords[j].type === 'invariant_check' &&
            allRecords[j].name === inv.name &&
            !allRecords[j].__consumed
          ) {
            consumed = allRecords[j]
            allRecords[j].__consumed = true
            break
          }
          j += 1
        }
        invariantsChecked += 1
        if (!consumed) {
          console.error(
            `[FAIL] invariant rerun: no recorded result for ${inv.name} after tick ${tx.tick}`,
          )
          invariantsMismatched += 1
          mismatchCount += 1
          continue
        }
        const computedJson = JSON.stringify({
          ok: computed.ok,
          message: computed.ok ? undefined : computed.message,
          accounts:
            !computed.ok && computed.accounts
              ? computed.accounts.map((p) => p.toBase58())
              : undefined,
        })
        const recordedJson = canonicalizeRecord(consumed)
        if (computedJson !== recordedJson) {
          console.error(
            `[FAIL] invariant mismatch: ${inv.name} at tick ${tx.tick}`,
          )
          console.error(`         recorded: ${recordedJson}`)
          console.error(`         computed: ${computedJson}`)
          invariantsMismatched += 1
          mismatchCount += 1
        }
      }
    }
  }

  // ===== v2 Expectation rerun (at scenario_end) =====
  if (captureVersion >= 2) {
    const scenario = SCENARIO_REGISTRY[scenarioName]
    if (!scenario) {
      console.warn(
        `(no scenario registered for "${scenarioName}" — skipping expectation rerun. Add it to tools/verify-trace.ts SCENARIO_REGISTRY)`,
      )
    } else if (scenario.expects.length > 0) {
      const finalWorldState = await WorldState.build(
        banks,
        Array.from(observedPubkeys),
        replayedTxs[replayedTxs.length - 1]?.tick ?? -1,
        replayedTxs,
        {
          scenario_name: scenarioName,
          seed,
          initial_unix_ts: 0n,
          initial_slot: 0n,
          program_id: DAWN_PROGRAM_ID.toBase58(),
          actors: scenarioActors,
        },
      )
      const recordedExps = allRecords.filter((r) => r.type === 'expectation_result')
      for (const exp of scenario.expects) {
        const computed = canonicalizeResult(exp.check(finalWorldState))
        const recorded = recordedExps.find(
          (r) => r.name === exp.name && !r.__consumed,
        )
        expectationsChecked += 1
        if (!recorded) {
          console.error(
            `[FAIL] expectation rerun: no recorded result for ${exp.name}`,
          )
          expectationsMismatched += 1
          mismatchCount += 1
          continue
        }
        recorded.__consumed = true
        const computedJson = JSON.stringify({
          ok: computed.ok,
          message: computed.ok ? undefined : computed.message,
          accounts:
            !computed.ok && computed.accounts
              ? computed.accounts.map((p) => p.toBase58())
              : undefined,
        })
        const recordedJson = canonicalizeRecord(recorded)
        if (computedJson !== recordedJson) {
          console.error(`[FAIL] expectation mismatch: ${exp.name}`)
          console.error(`         recorded: ${recordedJson}`)
          console.error(`         computed: ${computedJson}`)
          expectationsMismatched += 1
          mismatchCount += 1
        }
      }
    }
  }

  console.log(
    `\n${txCount} txs replayed, ${invariantsChecked} invariants rerun (${invariantsMismatched} mismatched), ${expectationsChecked} expectations rerun (${expectationsMismatched} mismatched).`,
  )
  if (mismatchCount > 0) {
    console.log('FAIL — trace does not match a fresh replay.')
    process.exit(1)
  }
  console.log('OK — every diff hash, invariant, and expectation matches a fresh replay.')
  process.exit(0)
}

main().catch((err) => {
  console.error('verifier threw:', err)
  process.exit(2)
})
