/**
 * Global invariants — universal protocol properties that must hold
 * after every (attempted) tx. The capture layer runs every invariant
 * whose `appliesTo` passes, records the result in the trace as an
 * `invariant_check` record, and the verifier independently re-runs
 * each one against a freshly-rebuilt WorldState during replay,
 * asserting the recorded result matches.
 *
 * Hard rules for `check`:
 *   - Pure function of WorldState. No clock, randomness, async, I/O.
 *   - If returning `accounts: PublicKey[]`, the helper sorts them
 *     canonically before serialization so capture and replay produce
 *     byte-identical records.
 *   - If the invariant doesn't apply yet, gate via `appliesTo` rather
 *     than returning `ok:true` from a vacuous check.
 *
 * Adding a new invariant: append one entry to GLOBAL_INVARIANTS. No
 * other plumbing changes required — capture / verifier / viewer pick
 * it up automatically.
 */

import { PublicKey } from '@solana/web3.js'

import {
  ACCOUNT_EDGES,
  EXTERNAL_TARGETS,
  EdgeSpec,
  EdgeTarget,
  resolveSeedKeyTarget,
} from './codec/edges'
import { dawnMintPda } from './codec/pda'
import { SplMint, SplTokenAccount } from './codec/spl'
import { AccountSnapshot, WorldState } from './world-state'

export type InvariantResult =
  | { ok: true }
  | {
      ok: false
      message: string
      accounts?: PublicKey[]
      details?: Record<string, unknown>
    }

export interface Invariant {
  name: string
  severity: 'error' | 'warning'
  check: (state: WorldState) => InvariantResult
  appliesTo?: (state: WorldState) => boolean
}

/** Canonical sort of accounts in an InvariantResult.
 *  Ensures capture and replay produce byte-identical output. */
export function canonicalizeResult(r: InvariantResult): InvariantResult {
  if (r.ok) return r
  if (!r.accounts) return r
  const sorted = [...r.accounts].sort((a, b) => {
    const sa = a.toBase58()
    const sb = b.toBase58()
    return sa < sb ? -1 : sa > sb ? 1 : 0
  })
  return { ...r, accounts: sorted }
}

// ---------------------------------------------------------------------------
// Invariant 1: dawn-supply-conserved
// ---------------------------------------------------------------------------
const DAWN_MINT_PUBKEY = dawnMintPda()[0]

const dawnSupplyConserved: Invariant = {
  name: 'dawn-supply-conserved',
  severity: 'error',
  appliesTo: (state) => state.byPubkey(DAWN_MINT_PUBKEY) != null,
  check: (state) => {
    const mintSnap = state.byPubkey(DAWN_MINT_PUBKEY)
    if (!mintSnap || mintSnap.kind !== 'spl-mint') {
      return { ok: false, message: 'DAWN mint not present or not a Mint account' }
    }
    const mintSupply = (mintSnap.decoded as SplMint).supply
    const summed = state.tokenSupplyOnAccounts(DAWN_MINT_PUBKEY)
    if (mintSupply !== summed) {
      return {
        ok: false,
        message: `DAWN supply mismatch: mint reports ${mintSupply}, sum across known token accounts is ${summed}`,
        accounts: [DAWN_MINT_PUBKEY],
        details: { mintSupply: mintSupply.toString(), summed: summed.toString() },
      }
    }
    return { ok: true }
  },
}

// ---------------------------------------------------------------------------
// Invariant 2: lease-ipv4-uniqueness
// ---------------------------------------------------------------------------
const leaseIpv4Uniqueness: Invariant = {
  name: 'lease-ipv4-uniqueness',
  severity: 'error',
  appliesTo: (state) => state.byType('IpLease').length > 0,
  check: (state) => {
    const leases = state.byType('IpLease')
    const byIp = new Map<string, string[]>()
    for (const snap of leases) {
      const ipv4 = (snap.decoded as any).ipv4
      // ipv4 is a base64-encoded 4-byte buffer in the captured state.
      // Decode to dotted-quad and key on it.
      const bin = typeof ipv4 === 'string' ? atobNode(ipv4) : ipv4
      const dotted = `${bin[0]}.${bin[1]}.${bin[2]}.${bin[3]}/${(snap.decoded as any).ipv4CidrMask}`
      if (!byIp.has(dotted)) byIp.set(dotted, [])
      byIp.get(dotted)!.push(snap.pubkey)
    }
    const conflicts: string[] = []
    const offenders: string[] = []
    for (const [ip, pks] of byIp.entries()) {
      if (pks.length > 1) {
        conflicts.push(`${ip}: ${pks.length} leases`)
        offenders.push(...pks)
      }
    }
    if (conflicts.length > 0) {
      return {
        ok: false,
        message: `IP collision detected: ${conflicts.join('; ')}`,
        accounts: offenders.map((p) => new PublicKey(p)),
      }
    }
    return { ok: true }
  },
}

// ---------------------------------------------------------------------------
// Invariant 3: lease-bitmap-consistency
// For every IpLease, the corresponding bit in its IpBlock is set.
// For every IpBlock, free_units + popcount(slots_chunks) == unit_capacity.
// ---------------------------------------------------------------------------
const leaseBitmapConsistency: Invariant = {
  name: 'lease-bitmap-consistency',
  severity: 'error',
  appliesTo: (state) => state.byType('IpBlock').length > 0,
  check: (state) => {
    const offenders: string[] = []
    const messages: string[] = []

    // Part A: every IpBlock obeys free_units + popcount = unit_capacity
    for (const snap of state.byType('IpBlock')) {
      const ip = snap.decoded as any
      const slots: bigint[] = ip.slotsChunks ?? []
      const popcount = slots.reduce((acc, w) => acc + popcount64(w), 0)
      const expected = (ip.unitCapacity ?? 0) - (ip.freeUnits ?? 0)
      if (popcount !== expected) {
        offenders.push(snap.pubkey)
        messages.push(
          `IpBlock ${shortPk(snap.pubkey)} popcount=${popcount} != allocated=${expected}`,
        )
      }
    }

    // Part B: every IpLease's bit is set in its block
    for (const lease of state.byType('IpLease')) {
      const l = lease.decoded as any
      // Find the IpBlock by (tier, block_index). Multiple roots per tier
      // are not yet exercised by our scenarios, so this matches uniquely.
      const block = state.byType('IpBlock').find((b) => {
        const bd = b.decoded as any
        return bd.tier === l.tier && bd.rootBlockIndex === l.blockIndex
      })
      if (!block) {
        offenders.push(lease.pubkey)
        messages.push(
          `IpLease ${shortPk(lease.pubkey)} references missing IpBlock (tier=${l.tier}, blockIndex=${l.blockIndex})`,
        )
        continue
      }
      const blockData = block.decoded as any
      const slots: bigint[] = blockData.slotsChunks ?? []
      const unitIdx = l.unitIndex
      const chunkIdx = unitIdx >> 6
      const bitIdx = unitIdx & 63
      const word = slots[chunkIdx] ?? 0n
      const isSet = (word >> BigInt(bitIdx)) & 1n
      if (isSet !== 1n) {
        offenders.push(lease.pubkey, block.pubkey)
        messages.push(
          `IpLease ${shortPk(lease.pubkey)} unit_index=${unitIdx} not set in IpBlock bitmap`,
        )
      }
    }

    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: messages.join('; '),
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

// ---------------------------------------------------------------------------
// Invariant 4: subscription-plan-exists
// ---------------------------------------------------------------------------
const subscriptionPlanExists: Invariant = {
  name: 'subscription-plan-exists',
  severity: 'error',
  appliesTo: (state) => state.byType('Subscription').length > 0,
  check: (state) => {
    const offenders: string[] = []
    for (const sub of state.byType('Subscription')) {
      const planPk = (sub.decoded as any).plan as PublicKey
      const plan = state.byPubkey(planPk)
      if (!plan || plan.kind !== 'dawn' || plan.type !== 'Plan') {
        offenders.push(sub.pubkey)
      }
    }
    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: `${offenders.length} Subscription(s) reference a missing or wrong-type Plan account`,
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

// ---------------------------------------------------------------------------
// Invariant 5: l2-bounds-respected
// L2 plan's duration/speed/capacity must be <= its parent_plan's.
// ---------------------------------------------------------------------------
const l2BoundsRespected: Invariant = {
  name: 'l2-bounds-respected',
  severity: 'error',
  appliesTo: (state) => state.byType('Plan').some((p) => (p.decoded as any).parentPlan != null),
  check: (state) => {
    const plans = state.byType('Plan')
    const offenders: string[] = []
    const messages: string[] = []
    for (const plan of plans) {
      const p = plan.decoded as any
      if (p.parentPlan == null) continue
      const parent = state.byPubkey(p.parentPlan as PublicKey)
      if (!parent || parent.type !== 'Plan') continue
      const pp = parent.decoded as any
      const violations: string[] = []
      if (p.duration > pp.duration) violations.push(`duration ${p.duration} > parent ${pp.duration}`)
      if (p.speed > pp.speed) violations.push(`speed ${p.speed} > parent ${pp.speed}`)
      if (p.capacity > pp.capacity) violations.push(`capacity ${p.capacity} > parent ${pp.capacity}`)
      if (violations.length) {
        offenders.push(plan.pubkey)
        messages.push(`L2 plan ${shortPk(plan.pubkey)}: ${violations.join(', ')}`)
      }
    }
    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: messages.join('; '),
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

// ---------------------------------------------------------------------------
// Invariant 6: device-local-domain-exists
// ---------------------------------------------------------------------------
const deviceLocalDomainExists: Invariant = {
  name: 'device-local-domain-exists',
  severity: 'error',
  appliesTo: (state) => state.byType('Device').length > 0,
  check: (state) => {
    const offenders: string[] = []
    for (const dev of state.byType('Device')) {
      const ld = (dev.decoded as any).localDomain as PublicKey
      const target = state.byPubkey(ld)
      if (!target || target.type !== 'LocalDomain') {
        offenders.push(dev.pubkey)
      }
    }
    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: `${offenders.length} Device(s) reference a missing LocalDomain`,
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

// ---------------------------------------------------------------------------
// Invariant 7: failed-tx-no-diff
// If the most-recent tx errored, its diff[] must be empty (a failed
// tx must not have produced state mutations).
// ---------------------------------------------------------------------------
const failedTxNoDiff: Invariant = {
  name: 'failed-tx-no-diff',
  severity: 'error',
  check: (state) => {
    const tx = state.lastTx()
    if (!tx) return { ok: true }
    if (tx.error == null) return { ok: true }
    if (tx.diff.length === 0) return { ok: true }
    return {
      ok: false,
      message: `failed tx (tick ${tx.tick}, error=${tx.error}) has ${tx.diff.length} entries in diff[] — failed txs must not mutate state`,
      accounts: tx.diff.map((d) => new PublicKey(d.pubkey)),
    }
  },
}

// ---------------------------------------------------------------------------
// Invariant 8: created-at-sane (warning)
// ---------------------------------------------------------------------------
const createdAtSane: Invariant = {
  name: 'created-at-sane',
  severity: 'warning',
  check: (state) => {
    const now = state.currentClock().unix_ts
    const offenders: string[] = []
    const messages: string[] = []
    for (const snap of state.allAccounts()) {
      if (snap.kind !== 'dawn' || snap.decoded == null) continue
      const created = (snap.decoded as any).createdAt
      if (created == null) continue
      const createdNum = typeof created === 'bigint' ? Number(created) : created
      if (createdNum === 0) {
        offenders.push(snap.pubkey)
        messages.push(`${snap.type} ${shortPk(snap.pubkey)} has created_at == 0`)
        continue
      }
      if (createdNum > now) {
        offenders.push(snap.pubkey)
        messages.push(`${snap.type} ${shortPk(snap.pubkey)} created_at ${createdNum} > clock ${now}`)
      }
    }
    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: messages.join('; '),
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

// ---------------------------------------------------------------------------
// Invariant 9: referential-integrity (edge-derived)
//
// For every dawn account in the world, walk its declared EdgeSpec[] from
// ACCOUNT_EDGES and check that each non-external, non-`from_creation`
// pubkey field references an extant account of the right type.
//
// Coverage:
//   - dawn → dawn:        target.kind === 'dawn' && target.type === edge.target
//   - dawn → Mint:        target.kind === 'spl-mint'
//   - dawn → TokenAccount: target.kind === 'spl-token-account'
//   - dawn → Wallet/ExternalProgram: SKIPPED. Wallets have no decodable
//     structure to verify, and external programs may legitimately not be
//     present in our observed-set (Raydium isn't loaded in scenarios yet).
//   - `from_creation` edges: SKIPPED. They're synthesized from creation-tx
//     context for the viewer, not stored as struct fields.
//
// Polymorphism: IpLease.seedKey's expected target depends on lease.tier
// (Subscriber → Subscription, Loopback/PtP → Device). Resolved via
// resolveSeedKeyTarget().
//
// This invariant is the structural counterpart to the type-specific ones
// above (subscription-plan-exists, device-local-domain-exists, etc.). Any
// new pubkey field a contributor adds gets covered the moment they update
// ACCOUNT_EDGES — no new invariant required.
// ---------------------------------------------------------------------------
const referentialIntegrity: Invariant = {
  name: 'referential-integrity',
  severity: 'error',
  appliesTo: (state) => state.allAccounts().some((a) => a.kind === 'dawn'),
  check: (state) => {
    const offenders: string[] = []
    const messages: string[] = []

    for (const snap of state.allAccounts()) {
      if (snap.kind !== 'dawn') continue
      const edges = ACCOUNT_EDGES[snap.type]
      if (!edges) continue
      const decoded = snap.decoded as Record<string, any>
      if (decoded == null) continue

      for (const edge of edges) {
        if (edge.from_creation) continue
        if (edge.target === 'Wallet' || edge.target === 'ExternalProgram') continue

        // Resolve expected target with seed_key polymorphism.
        const expectedTarget: EdgeTarget =
          snap.type === 'IpLease' && edge.field === 'seedKey'
            ? resolveSeedKeyTarget(decoded.tier as string)
            : edge.target

        const value = decoded[edge.field]

        if (edge.many) {
          if (!Array.isArray(value)) {
            offenders.push(snap.pubkey)
            messages.push(
              `${snap.type} ${shortPk(snap.pubkey)}.${edge.field} expected Vec<Pubkey>, got ${typeof value}`,
            )
            continue
          }
          for (const item of value) {
            if (item == null) continue
            checkRef(state, snap, edge, item, expectedTarget, offenders, messages)
          }
          continue
        }

        if (value == null) {
          if (edge.optional) continue
          offenders.push(snap.pubkey)
          messages.push(
            `${snap.type} ${shortPk(snap.pubkey)}.${edge.field} is null but field is required`,
          )
          continue
        }

        checkRef(state, snap, edge, value, expectedTarget, offenders, messages)
      }
    }

    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: messages.join('; '),
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

function checkRef(
  state: WorldState,
  source: AccountSnapshot,
  edge: EdgeSpec,
  targetPk: PublicKey,
  expectedTarget: EdgeTarget,
  offenders: string[],
  messages: string[],
): void {
  const target = state.byPubkey(targetPk)
  if (!target) {
    offenders.push(source.pubkey, targetPk.toBase58())
    messages.push(
      `${source.type} ${shortPk(source.pubkey)}.${edge.field} → ${shortPk(targetPk.toBase58())} (account does not exist)`,
    )
    return
  }
  // Externals validated structurally by kind, not by dawn type name.
  if (expectedTarget === 'Mint') {
    if (target.kind !== 'spl-mint') {
      offenders.push(source.pubkey, targetPk.toBase58())
      messages.push(
        `${source.type} ${shortPk(source.pubkey)}.${edge.field} → ${shortPk(targetPk.toBase58())} expected Mint, got ${target.type}`,
      )
    }
    return
  }
  if (expectedTarget === 'TokenAccount') {
    if (target.kind !== 'spl-token-account') {
      offenders.push(source.pubkey, targetPk.toBase58())
      messages.push(
        `${source.type} ${shortPk(source.pubkey)}.${edge.field} → ${shortPk(targetPk.toBase58())} expected TokenAccount, got ${target.type}`,
      )
    }
    return
  }
  // dawn → dawn
  if (target.kind !== 'dawn' || target.type !== expectedTarget) {
    offenders.push(source.pubkey, targetPk.toBase58())
    messages.push(
      `${source.type} ${shortPk(source.pubkey)}.${edge.field} → ${shortPk(targetPk.toBase58())} expected ${expectedTarget}, got ${target.type}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const GLOBAL_INVARIANTS: Invariant[] = [
  dawnSupplyConserved,
  leaseIpv4Uniqueness,
  leaseBitmapConsistency,
  subscriptionPlanExists,
  l2BoundsRespected,
  deviceLocalDomainExists,
  failedTxNoDiff,
  createdAtSane,
  referentialIntegrity,
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function popcount64(x: bigint): number {
  // Naive popcount — fine for the scenario sizes we run.
  let n = 0
  let v = x
  while (v !== 0n) {
    if ((v & 1n) === 1n) n += 1
    v >>= 1n
  }
  return n
}

function shortPk(pk: string): string {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`
}

/** atob shim that works in Node and produces a Uint8Array view. */
function atobNode(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}
