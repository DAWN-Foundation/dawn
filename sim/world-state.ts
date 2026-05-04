/**
 * WorldState — read-only snapshot of the simulator's account state at a
 * single tick. Built from scratch every tick (no incremental snapshot
 * is carried forward), per the assertion-layer spec.
 *
 * Construction recipe:
 *   1. Caller provides a set of all pubkeys ever observed in any tx's
 *      account list up to and including this tick (writable + readonly).
 *      That set persists across ticks; this WorldState does not.
 *   2. For each pubkey, getAccount() from bankrun.
 *   3. If null → drop (account closed or never created).
 *   4. Decode using the codec router for dawn types, or the SPL
 *      decoders for SPL Token program-owned accounts.
 *   5. Capture the clock once during construction so currentClock() is sync.
 *   6. Hand off to the invariant engine. Discard after.
 *
 * Methods are sync and pure. Invariants must not perform I/O.
 */

import { PublicKey } from '@solana/web3.js'
import { BanksClient } from 'solana-bankrun'

import { TOKEN_PROGRAM_ID } from './codec/program'
import { decodeAccount } from './codec/router'
import {
  SplMint,
  SplTokenAccount,
  decodeSplMint,
  decodeSplTokenAccount,
} from './codec/spl'

export type AccountKind = 'dawn' | 'spl-token-account' | 'spl-mint' | 'unknown'

export interface AccountSnapshot {
  pubkey: string                 // base58
  kind: AccountKind
  type: string                   // dawn account_type (e.g. "Plan"), or "SplTokenAccount" / "SplMint" / "Unknown"
  decoded: unknown | null        // typed object from the codec, or null for unknown
  rawLen: number
  owner: string                  // base58 of the program that owns this account
  lamports: number
}

/** A tx record as captured. Re-declared here to avoid circular imports. */
export interface TxRecordLike {
  type: 'tx'
  tick: number
  actor: string | null
  event_path: string[]
  signature: string | null
  instruction: {
    program: string
    program_id: string
    name: string | null
    discriminator_b64: string
    data_b64: string
    accounts: Array<{ pubkey: string; is_writable: boolean; is_signer: boolean }>
  }
  signers: Array<{ public_key: string; secret_key_b64: string }>
  logs: string[]
  compute_units_consumed: number | null
  error: string | null
  diff: Array<{ pubkey: string; account_type: string | null; raw_bytes_b64: string; raw_bytes_sha256: string; decoded: unknown; existed_before: boolean; owner: string; lamports: number; executable: boolean; rent_epoch: number; writable: boolean }>
  reads: Array<{ pubkey: string; account_type: string | null; raw_bytes_b64: string; raw_bytes_sha256: string; decoded: unknown; existed_before: boolean; owner: string; lamports: number; executable: boolean; rent_epoch: number; writable: boolean }>
  pre_tx_unix_ts: bigint
  pre_tx_slot: bigint
}

export interface ScenarioStartMetadataLike {
  scenario_name: string
  seed: number
  initial_unix_ts: bigint
  initial_slot: bigint
  program_id: string
  actors: Record<string, string>
}

export class WorldState {
  private accounts: Map<string, AccountSnapshot>
  private clockSnapshot: { unix_ts: number; slot: number }
  private tickIdx: number
  private txList: TxRecordLike[]
  private scenarioMetadata: ScenarioStartMetadataLike

  private constructor(
    accounts: Map<string, AccountSnapshot>,
    clock: { unix_ts: number; slot: number },
    tick: number,
    txList: TxRecordLike[],
    scenarioMetadata: ScenarioStartMetadataLike,
  ) {
    this.accounts = accounts
    this.clockSnapshot = clock
    this.tickIdx = tick
    this.txList = txList
    this.scenarioMetadata = scenarioMetadata
  }

  /**
   * Build a fresh WorldState by re-fetching every observed account from
   * bankrun. `observedPubkeys` is the persistent set of all pubkeys
   * referenced in any tx's account list up to and including this tick.
   * It MUST be sorted so iteration order is canonical (capture and
   * replay must agree byte-for-byte).
   */
  static async build(
    banks: BanksClient,
    observedPubkeys: string[],
    tick: number,
    txList: TxRecordLike[],
    scenarioMetadata: ScenarioStartMetadataLike,
  ): Promise<WorldState> {
    // Sort the keys so iteration order is deterministic between capture
    // and verifier replay. Map insertion order then encodes that ordering.
    const sortedPks = [...observedPubkeys].sort()
    const map = new Map<string, AccountSnapshot>()

    for (const pkStr of sortedPks) {
      const pk = new PublicKey(pkStr)
      const acc = await banks.getAccount(pk)
      if (!acc) continue // closed or never created — drop from this snapshot

      const data = Buffer.from(acc.data)
      const owner = new PublicKey(acc.owner).toBase58()
      const snap = decodeOne(pkStr, data, owner)
      snap.lamports = Number(acc.lamports)
      map.set(pkStr, snap)
    }

    const clock = await banks.getClock()
    return new WorldState(
      map,
      { unix_ts: Number(clock.unixTimestamp), slot: Number(clock.slot) },
      tick,
      txList,
      scenarioMetadata,
    )
  }

  // ---------------------------------------------------------------------
  // Read-only API used by invariants
  // ---------------------------------------------------------------------

  /** Lookup a single account by pubkey (string or PublicKey). null if absent. */
  byPubkey(pk: PublicKey | string): AccountSnapshot | null {
    const key = typeof pk === 'string' ? pk : pk.toBase58()
    return this.accounts.get(key) ?? null
  }

  /** All decoded dawn accounts of a specific account_type. */
  byType(type: string): AccountSnapshot[] {
    const out: AccountSnapshot[] = []
    for (const v of this.accounts.values()) {
      if (v.kind === 'dawn' && v.type === type) out.push(v)
    }
    return out
  }

  /** All SPL token accounts (the Token program-owned 165-byte accounts). */
  splTokenAccounts(): AccountSnapshot[] {
    const out: AccountSnapshot[] = []
    for (const v of this.accounts.values()) {
      if (v.kind === 'spl-token-account') out.push(v)
    }
    return out
  }

  /** All SPL mints (Token program-owned 82-byte accounts). */
  splMints(): AccountSnapshot[] {
    const out: AccountSnapshot[] = []
    for (const v of this.accounts.values()) {
      if (v.kind === 'spl-mint') out.push(v)
    }
    return out
  }

  /** Token balance of a specific SPL token account. 0 if absent or not a token account. */
  tokenBalance(account: PublicKey | string): bigint {
    const snap = this.byPubkey(account)
    if (!snap || snap.kind !== 'spl-token-account') return 0n
    return (snap.decoded as SplTokenAccount).amount
  }

  /** Sum of `amount` over every SPL token account whose mint == this mint. */
  tokenSupplyOnAccounts(mint: PublicKey | string): bigint {
    const mintStr = typeof mint === 'string' ? mint : mint.toBase58()
    let sum = 0n
    for (const snap of this.splTokenAccounts()) {
      const tok = snap.decoded as SplTokenAccount
      if (tok.mint.toBase58() === mintStr) sum += tok.amount
    }
    return sum
  }

  /** SPL Mint's reported supply (the on-chain `supply` field). */
  totalSupply(mint: PublicKey | string): bigint {
    const snap = this.byPubkey(mint)
    if (!snap || snap.kind !== 'spl-mint') return 0n
    return (snap.decoded as SplMint).supply
  }

  /** The dawn-program tick that just executed. -1 for setup-only state. */
  currentTick(): number {
    return this.tickIdx
  }

  /** The clock at the moment the WorldState was constructed. Sync. */
  currentClock(): { unix_ts: number; slot: number } {
    return this.clockSnapshot
  }

  /** The tx that just executed (the most recent entry in txList). */
  lastTx(): TxRecordLike | null {
    return this.txList.length > 0 ? this.txList[this.txList.length - 1] : null
  }

  /** Every captured tx where `pk` appeared in instruction.accounts, diff, or reads. */
  txHistoryFor(pk: PublicKey | string): TxRecordLike[] {
    const target = typeof pk === 'string' ? pk : pk.toBase58()
    const out: TxRecordLike[] = []
    for (const tx of this.txList) {
      const inAccts = tx.instruction.accounts.some((a) => a.pubkey === target)
      const inDiff = tx.diff.some((d) => d.pubkey === target)
      const inReads = tx.reads.some((r) => r.pubkey === target)
      if (inAccts || inDiff || inReads) out.push(tx)
    }
    return out
  }

  /** Scenario-start metadata: actors map, name, seed, initial timestamps. */
  metadata(): ScenarioStartMetadataLike {
    return this.scenarioMetadata
  }

  /** Iterate every account snapshot — for invariants that scan the world. */
  allAccounts(): AccountSnapshot[] {
    return Array.from(this.accounts.values())
  }
}

/**
 * Decide which decoder to use for a given account based on owner +
 * size, then run it. Falls back to "unknown" if nothing matches.
 */
function decodeOne(pubkey: string, data: Buffer, owner: string): AccountSnapshot {
  // Dawn accounts: identified by Anchor 8-byte discriminator.
  const dawn = decodeAccount(data)
  if (dawn) {
    return {
      pubkey,
      kind: 'dawn',
      type: dawn.type,
      decoded: dawn.decoded,
      rawLen: data.length,
      owner,
      lamports: 0, // filled in by caller
    }
  }
  // SPL Token program-owned accounts: discriminate by length.
  if (owner === TOKEN_PROGRAM_ID.toBase58()) {
    if (data.length === 165) {
      const dec = decodeSplTokenAccount(data)
      if (dec) {
        return { pubkey, kind: 'spl-token-account', type: 'SplTokenAccount', decoded: dec, rawLen: data.length, owner, lamports: 0 }
      }
    }
    if (data.length === 82) {
      const dec = decodeSplMint(data)
      if (dec) {
        return { pubkey, kind: 'spl-mint', type: 'SplMint', decoded: dec, rawLen: data.length, owner, lamports: 0 }
      }
    }
  }
  return { pubkey, kind: 'unknown', type: 'Unknown', decoded: null, rawLen: data.length, owner, lamports: 0 }
}
