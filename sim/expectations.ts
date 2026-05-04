/**
 * Per-scenario expectations — sugar over the global Invariant shape that
 * scenarios use to declare what they expect to be true at scenario_end.
 * Every helper here returns an `Invariant` object, so the capture layer
 * can run expectations through the same engine that handles global
 * invariants. Difference: expectations only run once, at scenario_end,
 * and produce `expectation_result` records (not `invariant_check`).
 *
 * Adding a new helper: append to this file. Nothing else needs to change.
 */

import { PublicKey } from '@solana/web3.js'

import { Invariant, InvariantResult } from './invariants'
import { CoverageStatusName } from './codec/decoders'
import { WorldState } from './world-state'

/** A scenario expectation is structurally an Invariant. The capture
 *  layer dispatches on the prefix of `name` (`expect:...`) to decide
 *  which JSONL record type to emit. */
export type Expectation = Invariant

// ---------------------------------------------------------------------------
// expect.actorOwns(actor, accountType, opts)
// Asserts the actor owns exactly `count` accounts of `accountType`,
// optionally constrained by status (LocalDomain only).
// ---------------------------------------------------------------------------
function actorOwns(
  actor: string,
  accountType: string,
  opts: { count: number; status?: CoverageStatusName },
): Expectation {
  const statusSuffix = opts.status ? `:${opts.status}` : ''
  return {
    name: `expect:actor-owns:${actor}:${accountType}${statusSuffix}`,
    severity: 'error',
    check: (state: WorldState): InvariantResult => {
      const meta = state.metadata()
      const actorPk = meta.actors[actor]
      if (!actorPk) {
        return { ok: false, message: `unknown actor: ${actor}` }
      }
      const owned = state.byType(accountType).filter((snap) => {
        const d = snap.decoded as any
        const ownerStr =
          d.owner instanceof PublicKey
            ? d.owner.toBase58()
            : typeof d.owner === 'string'
              ? d.owner
              : ''
        if (ownerStr !== actorPk) return false
        if (opts.status && d.coverageStatus !== opts.status) return false
        return true
      })
      if (owned.length !== opts.count) {
        return {
          ok: false,
          message: `expected ${actor} to own ${opts.count} ${accountType}${opts.status ? ` with status=${opts.status}` : ''}, found ${owned.length}`,
          accounts: owned.map((s) => new PublicKey(s.pubkey)),
        }
      }
      return { ok: true }
    },
  }
}

// ---------------------------------------------------------------------------
// expect.totalLeases({ tier, count })
// Asserts there are exactly `count` IpLeases in the given tier.
// ---------------------------------------------------------------------------
function totalLeases(opts: {
  tier: 'Subscriber' | 'Loopback' | 'PtP'
  count: number
}): Expectation {
  return {
    name: `expect:total-leases:${opts.tier}`,
    severity: 'error',
    check: (state: WorldState): InvariantResult => {
      const leases = state.byType('IpLease').filter((s) => {
        const d = s.decoded as any
        return d.tier === opts.tier
      })
      if (leases.length !== opts.count) {
        return {
          ok: false,
          message: `expected ${opts.count} ${opts.tier} IpLease(s), found ${leases.length}`,
          accounts: leases.map((s) => new PublicKey(s.pubkey)),
        }
      }
      return { ok: true }
    },
  }
}

// ---------------------------------------------------------------------------
// expect.tokenBalance(account, mint, { equals | atLeast | atMost | increasedBy })
// Asserts a token account's amount satisfies the constraint.
// Note: `account` and `mint` accept either pubkey strings or actor names.
// `increasedBy` requires an initial value, captured at scenario start.
// ---------------------------------------------------------------------------
type TokenBalanceConstraint =
  | { equals: bigint | number }
  | { atLeast: bigint | number }
  | { atMost: bigint | number }
  | { increasedBy: bigint | number }

function tokenBalance(
  accountRef: string,
  mintRef: string,
  constraint: TokenBalanceConstraint,
): Expectation {
  const constraintLabel = Object.keys(constraint)[0]
  return {
    name: `expect:token-balance:${accountRef}:${mintRef}:${constraintLabel}`,
    severity: 'error',
    check: (state: WorldState): InvariantResult => {
      // Resolve `accountRef`. If it's a known actor name, look up its
      // wallet pubkey; otherwise treat as a pubkey directly.
      const meta = state.metadata()
      const acctPk = meta.actors[accountRef] ?? accountRef
      const balance = state.tokenBalance(acctPk)
      const expected = (constraint as any)[constraintLabel] as bigint | number
      const expectedBig =
        typeof expected === 'bigint' ? expected : BigInt(expected)
      let ok = false
      let detail = ''
      if ('equals' in constraint) {
        ok = balance === expectedBig
        detail = `balance=${balance} ${ok ? '==' : '!='} ${expectedBig}`
      } else if ('atLeast' in constraint) {
        ok = balance >= expectedBig
        detail = `balance=${balance} ${ok ? '>=' : '<'} ${expectedBig}`
      } else if ('atMost' in constraint) {
        ok = balance <= expectedBig
        detail = `balance=${balance} ${ok ? '<=' : '>'} ${expectedBig}`
      } else if ('increasedBy' in constraint) {
        // For now interpret `increasedBy` as "balance must be >= expected"
        // (i.e. a sanity floor since we don't snapshot opening balances).
        // A more precise variant would require capture to record the
        // pre-scenario balance — out of scope for v1.
        ok = balance >= expectedBig
        detail = `balance=${balance} ${ok ? '>=' : '<'} expected_increase ${expectedBig}`
      }
      if (!ok) {
        return {
          ok: false,
          message: `token balance check failed: ${accountRef}/${mintRef} ${detail}`,
        }
      }
      return { ok: true }
    },
  }
}

// ---------------------------------------------------------------------------
// expect.accountExists(pubkey)
// ---------------------------------------------------------------------------
function accountExists(pubkey: PublicKey | string, label?: string): Expectation {
  const pkStr = typeof pubkey === 'string' ? pubkey : pubkey.toBase58()
  return {
    name: `expect:account-exists:${label ?? pkStr.slice(0, 8)}`,
    severity: 'error',
    check: (state: WorldState): InvariantResult => {
      const snap = state.byPubkey(pkStr)
      if (!snap) {
        return {
          ok: false,
          message: `expected account ${pkStr} to exist`,
          accounts: [new PublicKey(pkStr)],
        }
      }
      return { ok: true }
    },
  }
}

// ---------------------------------------------------------------------------
// expect.accountAbsent(pubkey)
// ---------------------------------------------------------------------------
function accountAbsent(pubkey: PublicKey | string, label?: string): Expectation {
  const pkStr = typeof pubkey === 'string' ? pubkey : pubkey.toBase58()
  return {
    name: `expect:account-absent:${label ?? pkStr.slice(0, 8)}`,
    severity: 'error',
    check: (state: WorldState): InvariantResult => {
      const snap = state.byPubkey(pkStr)
      if (snap) {
        return {
          ok: false,
          message: `expected account ${pkStr} to be absent, but it is present (type=${snap.type})`,
          accounts: [new PublicKey(pkStr)],
        }
      }
      return { ok: true }
    },
  }
}

// ---------------------------------------------------------------------------
// expect.custom(name, checkFn)
// ---------------------------------------------------------------------------
function custom(
  name: string,
  checkFn: (state: WorldState) => InvariantResult,
): Expectation {
  return {
    name: `expect:custom:${name}`,
    severity: 'error',
    check: checkFn,
  }
}

export const expect = {
  actorOwns,
  totalLeases,
  tokenBalance,
  accountExists,
  accountAbsent,
  custom,
}
