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
  EdgeSpec,
  EdgeTarget,
} from './codec/edges'
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
// Invariant: device-local-domain-exists
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
// Invariant: failed-tx-no-diff
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
// Invariant: created-at-sane (warning)
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
// Invariant: referential-integrity (edge-derived)
//
// For every dawn account in the world, walk its declared EdgeSpec[] from
// ACCOUNT_EDGES and check that each non-external, non-`from_creation`
// pubkey field references an extant account of the right type.
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

        const expectedTarget: EdgeTarget = edge.target
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
// Invariant: access-domain-cpd-set
// Every AccessDomain has a non-default control_plane_device. Catches
// "operator forgot to plug in the CPD on creation."
// ---------------------------------------------------------------------------
const DEFAULT_PUBKEY = PublicKey.default

const accessDomainCpdSet: Invariant = {
  name: 'access-domain-cpd-set',
  severity: 'error',
  appliesTo: (state) => state.byType('AccessDomain').length > 0,
  check: (state) => {
    const offenders: string[] = []
    for (const ad of state.byType('AccessDomain')) {
      const cpd = (ad.decoded as any).controlPlaneDevice as PublicKey
      if (!cpd || cpd.equals(DEFAULT_PUBKEY)) offenders.push(ad.pubkey)
    }
    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: `${offenders.length} AccessDomain(s) have an unset control_plane_device`,
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

// ---------------------------------------------------------------------------
// Invariant: credential-sealed-well-formed
// Every Credential.sealed_payload's first 32 bytes (the ephemeral X25519
// pubkey portion of the libsodium sealed-box envelope) are non-zero.
// ---------------------------------------------------------------------------
const credentialSealedWellFormed: Invariant = {
  name: 'credential-sealed-well-formed',
  severity: 'error',
  appliesTo: (state) => state.byType('Credential').length > 0,
  check: (state) => {
    const offenders: string[] = []
    for (const cred of state.byType('Credential')) {
      const sealed = (cred.decoded as any).sealedPayload as Buffer | undefined
      if (!sealed || sealed.length !== 128) {
        offenders.push(cred.pubkey)
        continue
      }
      const eph = sealed.subarray(0, 32)
      let any = false
      for (let i = 0; i < 32; i++) if (eph[i] !== 0) { any = true; break }
      if (!any) offenders.push(cred.pubkey)
    }
    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: `${offenders.length} Credential(s) have a malformed sealed_payload`,
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

// ---------------------------------------------------------------------------
// Invariant: credential-vlan-id-valid
// When Credential.vlan_id is Some, it's in 1..=4094 (mirrors on-chain check).
// ---------------------------------------------------------------------------
const credentialVlanIdValid: Invariant = {
  name: 'credential-vlan-id-valid',
  severity: 'error',
  appliesTo: (state) =>
    state.byType('Credential').some((c) => (c.decoded as any).vlanId != null),
  check: (state) => {
    const offenders: string[] = []
    for (const cred of state.byType('Credential')) {
      const v = (cred.decoded as any).vlanId as number | null
      if (v == null) continue
      if (v < 1 || v > 4094) offenders.push(cred.pubkey)
    }
    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: `${offenders.length} Credential(s) have an out-of-range VLAN id`,
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

// ---------------------------------------------------------------------------
// Invariant: domain-authority-not-expired
// Every live DomainAuthority either has no expiry, or its expires_at is
// in the future. An expired-but-still-on-chain grant is a structural
// failure — the program rejects use of expired grants at register time,
// but the operator should have revoked them already.
// ---------------------------------------------------------------------------
const domainAuthorityNotExpired: Invariant = {
  name: 'domain-authority-not-expired',
  severity: 'warning',
  appliesTo: (state) => state.byType('DomainAuthority').length > 0,
  check: (state) => {
    const now = state.currentClock().unix_ts
    const offenders: string[] = []
    const messages: string[] = []
    for (const da of state.byType('DomainAuthority')) {
      const exp = (da.decoded as any).expiresAt as bigint | null
      if (exp == null) continue
      const expN = typeof exp === 'bigint' ? Number(exp) : exp
      if (expN <= now) {
        offenders.push(da.pubkey)
        messages.push(
          `DomainAuthority ${shortPk(da.pubkey)} expired at ${expN} (now=${now})`,
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
// Invariant: psk-method-params-valid
// For every Mpsk/Psk AuthMethod, the parameters[..128] prefix decodes
// as a well-formed PSKMethodParams: at least one band populated, each
// active band's label_len in 1..=32, each label is valid utf-8 in its
// declared prefix, security/encryption/rotation in their valid ranges.
// ---------------------------------------------------------------------------
const pskMethodParamsValid: Invariant = {
  name: 'psk-method-params-valid',
  severity: 'error',
  appliesTo: (state) =>
    state
      .byType('AuthMethod')
      .some((a) => {
        const t = (a.decoded as any).methodType
        return t === 'Mpsk' || t === 'Psk'
      }),
  check: (state) => {
    const offenders: string[] = []
    const messages: string[] = []
    for (const am of state.byType('AuthMethod')) {
      const d = am.decoded as any
      if (d.methodType !== 'Mpsk' && d.methodType !== 'Psk') continue
      const params: Buffer = d.parameters
      if (params.length !== 256) {
        offenders.push(am.pubkey)
        messages.push(`${shortPk(am.pubkey)}: parameters not 256 bytes`)
        continue
      }
      const security = params.readUInt8(0)
      const encryption = params.readUInt8(1)
      const rotation = params.readUInt32LE(2)
      const len2_4 = params.readUInt8(6)
      const len5 = params.readUInt8(6 + 1 + 32)
      const len6 = params.readUInt8(6 + 2 * (1 + 32))
      const issues: string[] = []
      if (security > 1) issues.push(`security=${security}`)
      if (encryption > 2) issues.push(`encryption=${encryption}`)
      if (rotation !== 0 && (rotation < 3600 || rotation > 604800)) {
        issues.push(`rotation=${rotation}`)
      }
      if (len2_4 === 0 && len5 === 0 && len6 === 0) {
        issues.push('no active band')
      }
      for (const [name, len, off] of [
        ['2.4GHz', len2_4, 6 + 1],
        ['5GHz', len5, 6 + 2 + 32],
        ['6GHz', len6, 6 + 3 + 64],
      ] as const) {
        if (len === 0) continue
        if (len > 32) {
          issues.push(`${name} len=${len}`)
          continue
        }
        const label = params.subarray(off, off + len)
        try {
          label.toString('utf8')
        } catch {
          issues.push(`${name} not utf8`)
        }
      }
      if (issues.length > 0) {
        offenders.push(am.pubkey)
        messages.push(`${shortPk(am.pubkey)}: ${issues.join('; ')}`)
      }
    }
    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: messages.join(' | '),
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

// ---------------------------------------------------------------------------
// Invariant: domain-authority-role-known
// Every DomainAuthority's role is a known variant. Catches enum-drift
// bugs (e.g. some old grant has a role byte that's been reassigned).
// ---------------------------------------------------------------------------
const KNOWN_DA_ROLES = new Set(['Registrar', 'ConfigPlaneManager'])

const domainAuthorityRoleKnown: Invariant = {
  name: 'domain-authority-role-known',
  severity: 'error',
  appliesTo: (state) => state.byType('DomainAuthority').length > 0,
  check: (state) => {
    const offenders: string[] = []
    for (const da of state.byType('DomainAuthority')) {
      const role = (da.decoded as any).role
      if (typeof role !== 'string' || !KNOWN_DA_ROLES.has(role)) {
        offenders.push(da.pubkey)
      }
    }
    if (offenders.length === 0) return { ok: true }
    return {
      ok: false,
      message: `${offenders.length} DomainAuthority(s) have an unknown role`,
      accounts: offenders.map((p) => new PublicKey(p)),
    }
  },
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const GLOBAL_INVARIANTS: Invariant[] = [
  deviceLocalDomainExists,
  failedTxNoDiff,
  createdAtSane,
  referentialIntegrity,
  accessDomainCpdSet,
  credentialSealedWellFormed,
  credentialVlanIdValid,
  domainAuthorityNotExpired,
  pskMethodParamsValid,
  domainAuthorityRoleKnown,
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortPk(pk: string): string {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`
}
