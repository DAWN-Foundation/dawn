/**
 * Capture wrapper around bankrun.
 *
 * Every transaction submitted to the simulator goes through this class.
 * For each tx we:
 *   1. Snapshot pre-state for every account (writable + readonly) referenced
 *      in the instruction.
 *   2. Call banksClient.tryProcessTransaction.
 *   3. Snapshot post-state for the same accounts.
 *   4. For every WRITABLE account, hash the post-state bytes and write a
 *      diff entry. Decoded values are display-only; the hash is the source
 *      of truth.
 *   5. Read-only accounts are also captured (raw bytes + decoded for
 *      inspector context) but unhashed and not part of the verifier's
 *      assertion surface.
 *   6. Append a `tx` JSONL record.
 *
 * Atomicity: bytes come straight from banksClient.getAccount, are not
 * massaged. We never infer state from event payloads or pre-computed
 * expectations.
 *
 * Signers (including private keys) are recorded so the verifier can
 * deterministically replay the trace. Local-only sim traces.
 */

import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { BanksClient, Clock, ProgramTestContext } from 'solana-bankrun'

import { DAWN_PROGRAM_ID } from '../../sim/codec/program'
import { IX_DISC } from '../../sim/codec/discriminators'
import { decodeAccount, identifyAccount } from '../../sim/codec/router'
import { ACCOUNT_EDGES, ACCOUNT_TYPE_COLORS } from '../../sim/codec/edges'
import {
  GLOBAL_INVARIANTS,
  Invariant,
  canonicalizeResult,
} from '../../sim/invariants'
import { Expectation } from '../../sim/expectations'
import { WorldState } from '../../sim/world-state'

// ---------------------------------------------------------------------------
// JSONL record shapes
// ---------------------------------------------------------------------------

export interface AccountStateRecord {
  pubkey: string
  account_type: string | null // dawn account type, or null for non-dawn
  raw_bytes_b64: string
  raw_bytes_sha256: string
  decoded: unknown | null
  existed_before: boolean
  // post-state metadata pulled from banksClient
  owner: string
  lamports: number
  executable: boolean
  rent_epoch: number
  // True iff this account was in the writable list (and thus part of the
  // verifier's hash-checked diff).
  writable: boolean
}

export interface InstructionAccount {
  pubkey: string
  is_writable: boolean
  is_signer: boolean
}

export interface TxRecord {
  type: 'tx'
  tick: number
  /** Logical actor whose intent drove this tx (e.g. "foundation",
   *  "sp_mission"). Determined by the active event when the tx is sent;
   *  null for txs sent outside any event. */
  actor: string | null
  /** Active event stack at the time of the tx, deepest last. Empty if
   *  the tx wasn't wrapped in an event. */
  event_path: string[]
  /** Bankrun clock state at the moment we submitted the tx — needed by
   *  the verifier to make Clock::get() in the program return the same
   *  unix_timestamp on replay (otherwise on-chain `created_at` fields
   *  don't match and hashes diverge). */
  pre_tx_unix_ts: bigint
  pre_tx_slot: bigint
  signature: string | null
  instruction: {
    program: string
    program_id: string
    name: string | null // dawn instruction name if discriminator matches, else null
    discriminator_b64: string
    data_b64: string
    accounts: InstructionAccount[]
  }
  signers: Array<{
    public_key: string
    secret_key_b64: string // 64-byte ed25519 secret key
  }>
  logs: string[]
  compute_units_consumed: number | null
  error: string | null
  /** Writable accounts: hashed; verifier asserts on these. */
  diff: AccountStateRecord[]
  /** Read-only accounts: captured for inspector context, not hashed. */
  reads: AccountStateRecord[]
}

export interface ClockRecord {
  type: 'clock'
  tick: number
  unix_ts: bigint
  slot: bigint
}

export interface ScenarioStartRecord {
  type: 'scenario_start'
  scenario_name: string
  seed: number
  initial_unix_ts: bigint
  initial_slot: bigint
  program_id: string
  capture_version: number
  /** Embedded codec metadata so the viewer doesn't need a separate file.
   *  Adding a new account type to the program means updating ACCOUNT_EDGES
   *  in sim/codec/edges.ts and re-running the scenario; the viewer picks
   *  up the new metadata from the trace itself. */
  metadata: {
    account_edges: typeof ACCOUNT_EDGES
    account_type_colors: Record<string, string>
    /** name -> pubkey base58. The viewer uses this to display friendly
     *  actor names ("sp_mission") next to wallet pubkeys in the inspector. */
    actors: Record<string, string>
  }
}

export interface EventBeginRecord {
  type: 'event_begin'
  event_id: string
  name: string
  parent: string | null
  /** Logical actor responsible for this event (matches a key in
   *  scenario_start.metadata.actors). Optional. */
  actor: string | null
  /** Plain-English explanation of what this event does at the business
   *  level. Surfaced verbatim in the viewer's event inspector. Optional. */
  description: string | null
  /** The dawn tick that the next dawn-program tx in this event will have.
   *  If no dawn tx happens during the event, end_tick == begin_tick. */
  begin_tick: number
}

export interface EventEndRecord {
  type: 'event_end'
  event_id: string
  /** The dawn tick of the LAST dawn-program tx in this event. If no dawn
   *  tx happened inside, this equals begin_tick. */
  end_tick: number
}

/** Result of running one global invariant against the WorldState after
 *  a single tx. The verifier independently re-runs the invariant on
 *  replay and asserts these fields match byte-for-byte. */
export interface InvariantCheckRecord {
  type: 'invariant_check'
  /** The tick of the tx the invariant ran after, or -1 for non-dawn setup. */
  tick: number
  name: string
  severity: 'error' | 'warning'
  ok: boolean
  message?: string
  /** Sorted base58 strings — canonical ordering enforced. */
  accounts?: string[]
}

/** Result of running one scenario expectation at scenario_end. */
export interface ExpectationResultRecord {
  type: 'expectation_result'
  scenario: string
  name: string
  severity: 'error' | 'warning'
  ok: boolean
  message?: string
  accounts?: string[]
}

export interface ScenarioEndRecord {
  type: 'scenario_end'
  tick: number
  unix_ts: bigint
  slot: bigint
  final_snapshot_path: string
}

// ---------------------------------------------------------------------------
// JSONL serialization with bigint support
// ---------------------------------------------------------------------------

function jsonReplacer(_k: string, v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString() + 'n'
  if (v instanceof PublicKey) return v.toBase58()
  if (Buffer.isBuffer(v)) return v.toString('base64')
  return v
}

function dumpJsonl(obj: unknown): string {
  return JSON.stringify(obj, jsonReplacer) + '\n'
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

// Reverse-lookup discriminator → instruction name.
const DISC_TO_NAME = (() => {
  const map: Record<string, string> = {}
  for (const [name, disc] of Object.entries(IX_DISC)) {
    map[disc.toString('base64')] = name
  }
  return map
})()

// ---------------------------------------------------------------------------
// Capture class
// ---------------------------------------------------------------------------

export interface CaptureOptions {
  scenarioName: string
  seed: number
  /** Where to write traces. Defaults to runs/<scenario>/. */
  runsDir?: string
  /** Programs to consider "dawn-related" — defines what counts as a tick.
   *  Currently any tx whose first instruction targets DAWN_PROGRAM_ID
   *  is a tick. Other transactions (e.g. SPL token CreateMint during setup)
   *  are still captured but with `tick = -1`. */
  programId?: PublicKey
}

export class Capture {
  private readonly ctx: ProgramTestContext
  private readonly banks: BanksClient
  private readonly opts: Required<Omit<CaptureOptions, 'programId'>> & {
    programId: PublicKey
  }
  private readonly tracePath: string
  private readonly snapshotPath: string
  private readonly file: fs.WriteStream
  /** Set of every pubkey ever touched. The final snapshot includes these. */
  private readonly touched = new Set<string>()
  /** Persistent set of every pubkey EVER referenced in any tx's account
   *  list (writable + readonly). Grows monotonically. WorldState is
   *  rebuilt from this set after every tx. */
  private readonly observedPubkeys = new Set<string>()
  /** In-memory tx records (kept in order) for WorldState's txList +
   *  history queries. */
  private readonly txRecords: TxRecord[] = []
  /** Tick counter — incremented per dawn-program tx. */
  private tick = 0
  /** Scenario started flag. */
  private started = false
  /** Per-scenario expectations registered via runScenario. Run once at end. */
  private expectations: Expectation[] = []
  /** Stack of active events (deepest last). Drives tx.event_path + actor. */
  private readonly eventStack: Array<{
    id: string
    name: string
    actor: string | null
    begin_tick: number
  }> = []
  /** Counter for synthesizing unique event IDs. */
  private eventCounter = 0
  /** Last tick that had a dawn-program tx. Used to compute event end_tick. */
  private lastDawnTick = -1
  /** Declared actors: name -> pubkey base58. Embedded in scenario_start. */
  private readonly actors: Record<string, string> = {}

  constructor(ctx: ProgramTestContext, options: CaptureOptions) {
    this.ctx = ctx
    this.banks = ctx.banksClient
    this.opts = {
      runsDir: options.runsDir ?? 'runs',
      programId: options.programId ?? DAWN_PROGRAM_ID,
      scenarioName: options.scenarioName,
      seed: options.seed,
    }
    const dir = path.join(this.opts.runsDir, this.opts.scenarioName)
    fs.mkdirSync(dir, { recursive: true })
    const stamp = Date.now()
    const base = `${this.opts.scenarioName}-${this.opts.seed}-${stamp}`
    this.tracePath = path.join(dir, `${base}.jsonl`)
    this.snapshotPath = path.join(dir, `${base}.snapshot.json`)
    this.file = fs.createWriteStream(this.tracePath, { flags: 'a' })
  }

  /** Returns the trace file path. */
  get path(): string {
    return this.tracePath
  }

  /** Returns the snapshot file path. */
  get snapshot(): string {
    return this.snapshotPath
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    const clock = await this.banks.getClock()
    const rec: ScenarioStartRecord = {
      type: 'scenario_start',
      scenario_name: this.opts.scenarioName,
      seed: this.opts.seed,
      initial_unix_ts: clock.unixTimestamp,
      initial_slot: clock.slot,
      program_id: this.opts.programId.toBase58(),
      // v2: traces now contain invariant_check + expectation_result records.
      // The verifier and viewer accept both v1 (no invariants) and v2.
      capture_version: 2,
      metadata: {
        account_edges: ACCOUNT_EDGES,
        account_type_colors: ACCOUNT_TYPE_COLORS,
        actors: this.actors,
      },
    }
    this.file.write(dumpJsonl(rec))
  }

  /** Register the scenario's expectations. Run once at scenario_end. */
  registerExpectations(exps: Expectation[]): void {
    this.expectations = exps
  }

  /**
   * Register a logical actor name that maps to a wallet pubkey. The viewer
   * displays this name when inspecting the wallet; event and tx records
   * reference it via the `actor` field; invariants/expectations look up
   * pubkeys via `state.metadata().actors[name]`.
   *
   * If called BEFORE start(), the actor goes into the scenario_start
   * snapshot. If called AFTER start() (e.g. from inside scenario.run()),
   * we additionally emit a `actor_declared` record so the verifier can
   * grow its own actors map in lockstep with the original capture.
   */
  declareActor(name: string, pubkey: PublicKey | string): void {
    const pk = typeof pubkey === 'string' ? pubkey : pubkey.toBase58()
    this.actors[name] = pk
    if (this.started) {
      this.file.write(
        dumpJsonl({ type: 'actor_declared', name, pubkey: pk }),
      )
    }
  }

  /**
   * Mark the start of a business-logic event. Events form a tree — calls
   * can nest. Tx records emitted while the event is open carry its id in
   * their event_path. Pair every beginEvent with an endEvent — or use the
   * `event(name, opts, fn)` helper which does both for you.
   *
   * `opts.description` is a plain-English summary of what this event does
   * (one to three sentences). It is surfaced verbatim in the viewer's
   * inspector so a reader can understand what the business event entails
   * without reading the source.
   */
  beginEvent(
    name: string,
    opts?: { actor?: string; description?: string },
  ): string {
    if (!this.started) {
      // Defer; actual JSONL write requires start() to have written
      // scenario_start. Caller should call start() first.
    }
    this.eventCounter += 1
    const id = `e${this.eventCounter}`
    const parent =
      this.eventStack.length > 0
        ? this.eventStack[this.eventStack.length - 1].id
        : null
    const actor = opts?.actor ?? null
    const description = opts?.description ?? null
    const begin_tick = this.tick
    const rec: EventBeginRecord = {
      type: 'event_begin',
      event_id: id,
      name,
      parent,
      actor,
      description,
      begin_tick,
    }
    this.file.write(dumpJsonl(rec))
    this.eventStack.push({ id, name, actor, begin_tick })
    return id
  }

  /** Close the most recent event. */
  endEvent(expectedId?: string): void {
    const top = this.eventStack[this.eventStack.length - 1]
    if (!top) {
      throw new Error('endEvent called with no active event')
    }
    if (expectedId && top.id !== expectedId) {
      throw new Error(
        `endEvent mismatch: expected ${expectedId}, top of stack is ${top.id}`,
      )
    }
    this.eventStack.pop()
    // end_tick is the last dawn tick that occurred. If no dawn tx happened
    // during the event, end_tick == begin_tick.
    const end_tick =
      this.lastDawnTick >= top.begin_tick ? this.lastDawnTick : top.begin_tick
    const rec: EventEndRecord = {
      type: 'event_end',
      event_id: top.id,
      end_tick,
    }
    this.file.write(dumpJsonl(rec))
  }

  /** Convenience: run `fn` wrapped in begin/end. Pass `opts.description`
   *  to attach plain-English copy that the viewer surfaces in the
   *  event inspector. */
  async event<T>(
    name: string,
    optsOrFn:
      | { actor?: string; description?: string }
      | (() => Promise<T>),
    maybeFn?: () => Promise<T>,
  ): Promise<T> {
    const opts: { actor?: string; description?: string } =
      typeof optsOrFn === 'function' ? {} : optsOrFn
    const fn: () => Promise<T> =
      typeof optsOrFn === 'function' ? optsOrFn : maybeFn!
    const id = this.beginEvent(name, opts)
    try {
      return await fn()
    } finally {
      this.endEvent(id)
    }
  }

  /** Currently-active actor, taken from the deepest event with an actor set. */
  private activeActor(): string | null {
    for (let i = this.eventStack.length - 1; i >= 0; i--) {
      if (this.eventStack[i].actor) return this.eventStack[i].actor
    }
    return null
  }

  /**
   * Process a transaction: capture pre-state, send, capture post-state,
   * write tx record. Returns the bankrun result so callers can still
   * branch on success/failure.
   */
  async processTransaction(
    ix: TransactionInstruction,
    signers: Keypair[],
  ): Promise<{ ok: boolean; error: string | null; logs: string[] }> {
    if (!this.started) await this.start()

    // Snapshot clock state before submission so verifier can replay
    // with identical Clock::get() output.
    const preClock = await this.banks.getClock()

    // Build the tx.
    const tx = new Transaction()
    tx.feePayer = signers[0].publicKey
    tx.recentBlockhash = (await this.banks.getLatestBlockhash())[0]
    tx.add(ix)
    tx.sign(...signers)

    // Pre-state: every account referenced by the instruction.
    const allAccounts = ix.keys.map((k) => k.pubkey)
    const preStates = await Promise.all(
      allAccounts.map((pk) => this.banks.getAccount(pk)),
    )

    // Submit.
    const result = await this.banks.tryProcessTransaction(tx)
    const errString = result.result ? String(result.result) : null

    // Post-state: same accounts.
    const postStates = await Promise.all(
      allAccounts.map((pk) => this.banks.getAccount(pk)),
    )

    // Determine if this is a dawn-program tx (counts as a tick).
    const isDawnIx = ix.programId.equals(this.opts.programId)
    const tickIdx = isDawnIx ? this.tick++ : -1
    if (isDawnIx) this.lastDawnTick = tickIdx

    // Build account state records.
    const diff: AccountStateRecord[] = []
    const reads: AccountStateRecord[] = []
    for (let i = 0; i < ix.keys.length; i++) {
      const meta = ix.keys[i]
      const pk = allAccounts[i].toBase58()
      this.touched.add(pk)
      const post = postStates[i]
      const pre = preStates[i]
      if (!post) {
        // Account does not exist (and didn't before either, presumably).
        const rec: AccountStateRecord = {
          pubkey: pk,
          account_type: null,
          raw_bytes_b64: '',
          raw_bytes_sha256: sha256Hex(Buffer.alloc(0)),
          decoded: null,
          existed_before: pre != null,
          owner: '',
          lamports: 0,
          executable: false,
          rent_epoch: 0,
          writable: meta.isWritable,
        }
        if (meta.isWritable) diff.push(rec)
        else reads.push(rec)
        continue
      }
      const data = Buffer.from(post.data)
      const owner = new PublicKey(post.owner).toBase58()
      const decoded = decodeAccount(data)
      const rec: AccountStateRecord = {
        pubkey: pk,
        account_type: decoded ? decoded.type : null,
        raw_bytes_b64: data.toString('base64'),
        raw_bytes_sha256: sha256Hex(data),
        decoded: decoded ? decoded.decoded : null,
        existed_before: pre != null,
        owner,
        lamports: Number(post.lamports),
        executable: post.executable,
        rent_epoch: Number(post.rentEpoch ?? 0),
        writable: meta.isWritable,
      }
      if (meta.isWritable) diff.push(rec)
      else reads.push(rec)
    }

    // Identify dawn instruction by discriminator (if any).
    const data = Buffer.from(ix.data)
    const discBuf = data.subarray(0, Math.min(8, data.length))
    const ixName = isDawnIx ? DISC_TO_NAME[discBuf.toString('base64')] ?? null : null

    const txRec: TxRecord = {
      type: 'tx',
      tick: tickIdx,
      actor: this.activeActor(),
      event_path: this.eventStack.map((e) => e.id),
      pre_tx_unix_ts: preClock.unixTimestamp,
      pre_tx_slot: preClock.slot,
      signature: null, // bankrun doesn't expose tx signatures pre-confirmation
      instruction: {
        program: isDawnIx ? 'dawn' : 'other',
        program_id: ix.programId.toBase58(),
        name: ixName,
        discriminator_b64: discBuf.toString('base64'),
        data_b64: data.toString('base64'),
        accounts: ix.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          is_writable: k.isWritable,
          is_signer: k.isSigner,
        })),
      },
      signers: signers.map((kp) => ({
        public_key: kp.publicKey.toBase58(),
        secret_key_b64: Buffer.from(kp.secretKey).toString('base64'),
      })),
      logs: result.meta?.logMessages ?? [],
      compute_units_consumed:
        result.meta?.computeUnitsConsumed != null
          ? Number(result.meta.computeUnitsConsumed)
          : null,
      error: errString,
      diff,
      reads,
    }

    this.file.write(dumpJsonl(txRec))

    // Add to persistent state for WorldState construction. Every pubkey
    // referenced in any tx's account list is "observed" forever.
    for (const meta of ix.keys) this.observedPubkeys.add(meta.pubkey.toBase58())
    this.txRecords.push(txRec)

    // Build a fresh WorldState — from scratch, no incremental snapshot —
    // and run every applicable global invariant. Records are emitted to
    // the trace; the verifier independently re-runs them on replay.
    await this.runInvariants()

    return {
      ok: errString == null,
      error: errString,
      logs: txRec.logs,
    }
  }

  /**
   * Build WorldState and run every applicable global invariant.
   *
   * Emission rule: ONE `invariant_check` record per (invariant,
   * tx attempt) where `appliesTo(state)` returns true. Note "tx attempt",
   * not "tick" — setup txs at tick=-1 (e.g. mint creation, SOL transfers)
   * each trigger their own invariant pass, so multiple records can share
   * tick=-1. Invariants whose `appliesTo` gate is unsatisfied emit no
   * record at all (no vacuous passes).
   *
   * Implication: total record count = sum over invariants of
   * (#tx attempts where `appliesTo` was true), NOT (#invariants × #ticks).
   * The viewer's "Invariants" tab aggregates by NAME, not tick, so the
   * difference is invisible there. Replay symmetry is preserved because
   * the verifier rebuilds WorldState the same way and runs the same
   * `appliesTo` predicates in the same order.
   *
   * Failure mode to watch for: a buggy `appliesTo` that silently returns
   * false on states where the invariant *should* run leaves zero records
   * and looks indistinguishable from "invariant correctly skipped." The
   * invariant has effectively been disabled without anyone noticing.
   * Mitigation: every new invariant ships with at least one scenario whose
   * final state is expected to satisfy `appliesTo`. If that trace has zero
   * records for the invariant, the gate is wrong — the invariant never
   * ran. Treat zero-record-on-expected-applicable as a CI failure for new
   * invariants, not a silent pass. */
  private async runInvariants(): Promise<void> {
    const worldState = await WorldState.build(
      this.banks,
      Array.from(this.observedPubkeys),
      this.txRecords[this.txRecords.length - 1]?.tick ?? -1,
      this.txRecords as any,
      {
        scenario_name: this.opts.scenarioName,
        seed: this.opts.seed,
        initial_unix_ts: 0n,
        initial_slot: 0n,
        program_id: this.opts.programId.toBase58(),
        actors: this.actors,
      },
    )
    for (const inv of GLOBAL_INVARIANTS) {
      this.runOneInvariant(inv, worldState, /* isExpectation */ false)
    }
  }

  /** Run one invariant (or expectation), serialize the result. */
  private runOneInvariant(
    inv: Invariant,
    state: WorldState,
    isExpectation: boolean,
  ): void {
    if (inv.appliesTo && !inv.appliesTo(state)) return
    const raw = inv.check(state)
    const result = canonicalizeResult(raw)
    const tick = state.currentTick()
    if (isExpectation) {
      const rec: ExpectationResultRecord = {
        type: 'expectation_result',
        scenario: this.opts.scenarioName,
        name: inv.name,
        severity: inv.severity,
        ok: result.ok,
      }
      if (!result.ok) {
        rec.message = result.message
        if (result.accounts) {
          rec.accounts = result.accounts.map((p) => p.toBase58())
        }
      }
      this.file.write(dumpJsonl(rec))
    } else {
      const rec: InvariantCheckRecord = {
        type: 'invariant_check',
        tick,
        name: inv.name,
        severity: inv.severity,
        ok: result.ok,
      }
      if (!result.ok) {
        rec.message = result.message
        if (result.accounts) {
          rec.accounts = result.accounts.map((p) => p.toBase58())
        }
      }
      this.file.write(dumpJsonl(rec))
    }
  }

  /**
   * Advance bankrun's clock and emit a JSONL clock record.
   */
  async setClock(unixTs: bigint, slot?: bigint): Promise<void> {
    if (!this.started) await this.start()
    const current = await this.banks.getClock()
    const newSlot = slot ?? current.slot + 1n
    this.ctx.setClock(
      new Clock(
        newSlot,
        current.epochStartTimestamp,
        current.epoch,
        current.leaderScheduleEpoch,
        unixTs,
      ),
    )
    const rec: ClockRecord = {
      type: 'clock',
      tick: this.tick,
      unix_ts: unixTs,
      slot: newSlot,
    }
    this.file.write(dumpJsonl(rec))
  }

  /**
   * Close out the trace: take a final snapshot of every account ever
   * touched, write it to <base>.snapshot.json, then write the
   * scenario_end record and close the file.
   */
  async end(): Promise<void> {
    // Run scenario expectations against a final WorldState before writing
    // the snapshot/scenario_end records. expectation_result records are
    // emitted to the trace alongside the rest.
    if (this.expectations.length > 0) {
      const worldState = await WorldState.build(
        this.banks,
        Array.from(this.observedPubkeys),
        this.txRecords[this.txRecords.length - 1]?.tick ?? -1,
        this.txRecords as any,
        {
          scenario_name: this.opts.scenarioName,
          seed: this.opts.seed,
          initial_unix_ts: 0n,
          initial_slot: 0n,
          program_id: this.opts.programId.toBase58(),
          actors: this.actors,
        },
      )
      for (const exp of this.expectations) {
        this.runOneInvariant(exp, worldState, /* isExpectation */ true)
      }
    }

    const clock = await this.banks.getClock()
    const accounts: Array<{
      pubkey: string
      account_type: string | null
      raw_bytes_b64: string
      raw_bytes_sha256: string
      decoded: unknown | null
      owner: string
      lamports: number
    }> = []
    for (const pk of this.touched) {
      const acc = await this.banks.getAccount(new PublicKey(pk))
      if (!acc) continue
      const data = Buffer.from(acc.data)
      const decoded = decodeAccount(data)
      accounts.push({
        pubkey: pk,
        account_type: decoded ? decoded.type : identifyAccount(data),
        raw_bytes_b64: data.toString('base64'),
        raw_bytes_sha256: sha256Hex(data),
        decoded: decoded ? decoded.decoded : null,
        owner: new PublicKey(acc.owner).toBase58(),
        lamports: Number(acc.lamports),
      })
    }
    fs.writeFileSync(
      this.snapshotPath,
      JSON.stringify(
        { slot: clock.slot, unix_ts: clock.unixTimestamp, accounts },
        jsonReplacer,
        2,
      ),
    )
    const rec: ScenarioEndRecord = {
      type: 'scenario_end',
      tick: this.tick,
      unix_ts: clock.unixTimestamp,
      slot: clock.slot,
      final_snapshot_path: path.basename(this.snapshotPath),
    }
    this.file.write(dumpJsonl(rec))
    await new Promise<void>((resolve) => this.file.end(resolve))
  }
}
