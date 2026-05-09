/**
 * Typed graph metadata.
 *
 * For every dawn account type, declare every Pubkey-typed field and what
 * kind of node it points to. The viewer derives ALL edges from this map
 * at render time — never hand-coded.
 *
 * `target` may be a dawn account type OR one of the synthetic external
 * types in EXTERNAL_TARGETS (Wallet, Mint, TokenAccount, ExternalProgram).
 * Externals are rendered in a muted color.
 *
 * Adding a new dawn account type later requires only:
 *   1. A decoder in decoders.ts
 *   2. An entry in this map
 *   3. An entry in ACCOUNT_TYPE_COLORS below if you want a custom color
 */

export type EdgeTarget =
  // dawn account types
  | 'Config'
  | 'DeviceModel'
  | 'Device'
  | 'DeviceLocation'
  | 'LocalDomain'
  | 'AccessDomain'
  | 'DomainAuthority'
  | 'AuthMethod'
  | 'Credential'
  // synthetic externals (Mint/TokenAccount/ExternalProgram retained for
  // forward compatibility — not used in the lean access-domain build).
  | 'Wallet'
  | 'Mint'
  | 'TokenAccount'
  | 'ExternalProgram'

export interface EdgeSpec {
  /** Field name (snake_case, matching the on-chain struct). */
  field: string
  /** Display label on the edge. */
  label: string
  /** What kind of node the field points at. */
  target: EdgeTarget
  /** Optional<Pubkey> field — may be null. */
  optional?: boolean
  /** Vec<Pubkey> field — many edges from one source. */
  many?: boolean
  /** When true, the edge does not come from a struct field. Instead, the
   *  viewer scans the trace for the tx that first created this account
   *  and emits an edge to whichever writable account in that tx has the
   *  matching `target` type. */
  from_creation?: boolean
}

/**
 * Per-account-type edge map. Keys are the dawn account type names; values
 * are arrays of EdgeSpec, one per Pubkey-typed field on that struct.
 *
 * Field names are camelCase matching the decoder output. The viewer reads
 * `decoded[field]` to find the target pubkey.
 */
export const ACCOUNT_EDGES: Record<string, EdgeSpec[]> = {
  Config: [
    { field: 'authority', label: 'authority', target: 'Wallet' },
  ],

  DeviceModel: [
    // No pubkey fields.
  ],

  Device: [
    { field: 'owner', label: 'owner', target: 'Wallet' },
    { field: 'model', label: 'model', target: 'DeviceModel' },
    { field: 'localDomain', label: 'local_domain', target: 'LocalDomain' },
  ],

  DeviceLocation: [
    { field: 'device', label: 'device', target: 'Device' },
  ],

  LocalDomain: [
    { field: 'owner', label: 'owner', target: 'Wallet' },
  ],

  AccessDomain: [
    { field: 'owner', label: 'owner', target: 'Wallet' },
    { field: 'controlPlaneDevice', label: 'control_plane', target: 'Device' },
    { field: 'gatewayDevice', label: 'gateway_device', target: 'Device', optional: true },
    { field: 'localDomain', label: 'local_domain', target: 'LocalDomain', optional: true },
  ],

  DomainAuthority: [
    // `domain` field points at AccessDomain today; will also point at
    // DistributionDomain when those role variants land. Edge target is
    // AccessDomain for now since that's all we mint.
    { field: 'domain', label: 'domain', target: 'AccessDomain' },
    { field: 'authority', label: 'authority', target: 'Wallet' },
    { field: 'createdBy', label: 'created_by', target: 'Wallet' },
  ],

  AuthMethod: [
    { field: 'authority', label: 'authority', target: 'Wallet' },
    { field: 'accessDomain', label: 'access_domain', target: 'AccessDomain' },
  ],

  Credential: [
    { field: 'authority', label: 'authority', target: 'Wallet' },
    { field: 'accessDomain', label: 'access_domain', target: 'AccessDomain' },
    { field: 'authMethod', label: 'auth_method', target: 'AuthMethod' },
  ],
}

/**
 * Resolve the polymorphic target of a seed_key field. Currently unused
 * in the lean build (no IpLease accounts) but retained as a placeholder
 * so callers don't fail to import.
 */
export function resolveSeedKeyTarget(_tier: string): EdgeTarget {
  return 'Device'
}

/** Default node colors by account_type, used by the viewer.
 *  Palette is the DAWN dark-theme brand series (see DAWN_Dark_Theme_Style_Guide). */
export const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  // Protocol hub — full DAWN orange.
  Config: '#E8713A',

  // Access-domain plane.
  AccessDomain: '#F0B85C',

  // Physical/network plane.
  Device: '#5B8DEF',
  DeviceModel: '#7DA8F0',
  DeviceLocation: '#5B8DEF',
  LocalDomain: '#4A7BB8',

  // Auth.
  AuthMethod: '#A56DC4',
  Credential: '#C084FC',
  DomainAuthority: '#8E44AD',

  // Synthetic externals — muted.
  Wallet: '#BBBBBB',
  Mint: '#888888',
  TokenAccount: '#777777',
  ExternalProgram: '#666666',
}

export const EXTERNAL_TARGETS: EdgeTarget[] = [
  'Wallet',
  'Mint',
  'TokenAccount',
  'ExternalProgram',
]
