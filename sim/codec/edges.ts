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
  | 'TokenConfig'
  | 'DeviceModel'
  | 'Device'
  | 'DeviceLocation'
  | 'LocalDomain'
  | 'ServiceAgreement'
  | 'Plan'
  | 'DistributionDomain'
  | 'AccessDomain'
  | 'AuthMethod'
  | 'Credential'
  | 'Connection'
  | 'Subscription'
  | 'IpRegistry'
  | 'RootIpBlock'
  | 'IpBlock'
  | 'IpLease'
  // synthetic externals
  | 'Wallet'
  | 'Mint'
  | 'TokenAccount'
  | 'ExternalProgram'

export interface EdgeSpec {
  /** Field name (snake_case, matching the on-chain struct).
   *  Ignored when `from_creation` is true (no on-chain field is read). */
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
   *  matching `target` type. Used for parent/child relationships that
   *  exist only in the PDA seed structure (IPAM hierarchy: IpBlock's
   *  parent is RootIpBlock via PDA seeds, never as an account field). */
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
    { field: 'apiAuthority', label: 'api_authority', target: 'Wallet' },
    { field: 'tokenConfig', label: 'token_config', target: 'TokenConfig' },
    { field: 'stableMint', label: 'stable_mint', target: 'Mint' },
    { field: 'dawnMint', label: 'dawn_mint', target: 'Mint' },
    { field: 'feePoolDawnAccount', label: 'fee_pool', target: 'TokenAccount' },
    { field: 'daoDawnAccount', label: 'dao_pool', target: 'TokenAccount' },
    { field: 'validatorDawnAccount', label: 'validator_pool', target: 'TokenAccount' },
    { field: 'medallionDawnAccount', label: 'medallion_pool', target: 'TokenAccount' },
    { field: 'raydium', label: 'raydium', target: 'ExternalProgram' },
    { field: 'raydiumAuthority', label: 'raydium_authority', target: 'ExternalProgram' },
    { field: 'raydiumConfig', label: 'raydium_config', target: 'ExternalProgram' },
    { field: 'raydiumPool', label: 'raydium_pool', target: 'ExternalProgram' },
    { field: 'raydiumObservation', label: 'raydium_observation', target: 'ExternalProgram' },
  ],

  TokenConfig: [
    { field: 'dawnMint', label: 'dawn_mint', target: 'Mint' },
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

  ServiceAgreement: [
    // No pubkey fields.
  ],

  Plan: [
    { field: 'owner', label: 'owner', target: 'Wallet' },
    { field: 'accessDomain', label: 'access_domain', target: 'AccessDomain', optional: true },
    { field: 'distributionDomain', label: 'distribution_domain', target: 'DistributionDomain', optional: true },
    { field: 'localDomain', label: 'local_domain', target: 'LocalDomain' },
    { field: 'parentPlan', label: 'parent_plan', target: 'Plan', optional: true },
    { field: 'serviceAgreement', label: 'service_agreement', target: 'ServiceAgreement' },
    { field: 'authMethods', label: 'auth_method', target: 'AuthMethod', many: true },
  ],

  DistributionDomain: [
    { field: 'owner', label: 'owner', target: 'Wallet' },
    { field: 'localDomain', label: 'local_domain', target: 'LocalDomain' },
  ],

  AccessDomain: [
    { field: 'owner', label: 'owner', target: 'Wallet' },
    { field: 'localDomain', label: 'local_domain', target: 'LocalDomain' },
  ],

  AuthMethod: [
    { field: 'authority', label: 'authority', target: 'Wallet' },
    { field: 'device', label: 'device', target: 'Device' },
  ],

  Credential: [
    { field: 'authority', label: 'authority', target: 'Wallet' },
    { field: 'plan', label: 'plan', target: 'Plan' },
    { field: 'subscription', label: 'subscription', target: 'Subscription' },
    { field: 'authMethod', label: 'auth_method', target: 'AuthMethod' },
  ],

  Connection: [
    { field: 'authMethod', label: 'auth_method', target: 'AuthMethod' },
    { field: 'entityA', label: 'entity_a', target: 'Wallet' },
    { field: 'entityB', label: 'entity_b', target: 'Wallet' },
  ],

  Subscription: [
    { field: 'plan', label: 'plan', target: 'Plan' },
    { field: 'subscriber', label: 'subscriber', target: 'Wallet' },
    { field: 'device', label: 'device', target: 'Device', optional: true },
  ],

  IpRegistry: [
    { field: 'authority', label: 'authority', target: 'Wallet' },
  ],

  RootIpBlock: [
    { field: 'authority', label: 'authority', target: 'Wallet' },
    // Parent registry: stored only in PDA seeds. Resolved at viewer render
    // time by finding the IpRegistry that was a writable account in the
    // tx that first created this RootIpBlock.
    {
      field: '_creation_registry',
      label: 'registry',
      target: 'IpRegistry',
      from_creation: true,
    },
  ],

  IpBlock: [
    // Parent root block: same idea — derived from PDA seeds (root_ip_block
    // pubkey) but not stored as a struct field. Resolved via creation tx.
    {
      field: '_creation_root',
      label: 'root_block',
      target: 'RootIpBlock',
      from_creation: true,
    },
  ],

  IpLease: [
    // seed_key points at either a Subscription (Subscriber tier) or a Device
    // (Loopback/PtP tiers). The viewer can render this with target chosen
    // dynamically based on the lease's tier — see resolveSeedKeyTarget below.
    { field: 'seedKey', label: 'seed_key', target: 'Device' },
    { field: 'device', label: 'device', target: 'Device', optional: true },
    // Parent block: derived from creation tx context.
    {
      field: '_creation_block',
      label: 'block',
      target: 'IpBlock',
      from_creation: true,
    },
  ],
}

/**
 * IpLease.seed_key polymorphism: Subscriber tier → Subscription, others →
 * Device. The viewer calls this when rendering the seed_key edge to pick
 * the right target type.
 */
export function resolveSeedKeyTarget(tier: string): EdgeTarget {
  return tier === 'Subscriber' ? 'Subscription' : 'Device'
}

/** Default node colors by account_type, used by the viewer.
 *  Palette is the DAWN dark-theme brand series (see DAWN_Dark_Theme_Style_Guide):
 *    DAWN Orange  #E8713A   primary brand — reserved for the Config hub
 *    Light Orange #F08C4A   sibling accent
 *    Amber        #E8A54A   warm emphasis (plan-side domains)
 *    Green        #2EA87E   plans + subscriptions (positive states)
 *    Blue         #5B8DEF   physical/network plane (devices)
 *    Purple       #9B59B6   protocol primitives (IPAM, AMF)
 *    Grays        #BBBBBB→#666666  externals + supporting types
 */
export const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  // Protocol hub — the only place we use full DAWN orange.
  Config: '#E8713A',
  TokenConfig: '#F08C4A',

  // Plans + their domains: the commercial surface of the protocol.
  Plan: '#2EA87E',
  Subscription: '#3FBA90',
  ServiceAgreement: '#999999',
  DistributionDomain: '#E8A54A',
  AccessDomain: '#F0B85C',

  // Physical/network plane.
  Device: '#5B8DEF',
  DeviceModel: '#7DA8F0',
  DeviceLocation: '#5B8DEF',
  LocalDomain: '#4A7BB8',

  // IPAM stack.
  IpRegistry: '#9B59B6',
  RootIpBlock: '#A56DC4',
  IpBlock: '#B57BC9',
  IpLease: '#C084FC',

  // Auth / connections.
  AuthMethod: '#A56DC4',
  Credential: '#C084FC',
  Connection: '#C084FC',

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
