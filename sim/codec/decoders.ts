import { PublicKey } from '@solana/web3.js'

import { ACCOUNT_DISC } from './discriminators'

/**
 * Account-state introspection: byte-level deserializers that mirror
 * the `#[account]` structs in programs/dawn/src/state/.
 *
 * Layout: [8-byte account discriminator] [borsh-encoded fields].
 * Anchor uses Borsh, which for fixed-size types (primitives, arrays,
 * Pubkey-as-[u8;32]) is just a raw little-endian dump in field order.
 *
 * Each decoder verifies the discriminator and returns a typed object.
 */

class Cursor {
  constructor(public buf: Buffer, public offset = 0) {}

  u8(): number {
    const v = this.buf.readUInt8(this.offset)
    this.offset += 1
    return v
  }

  u16(): number {
    const v = this.buf.readUInt16LE(this.offset)
    this.offset += 2
    return v
  }

  u32(): number {
    const v = this.buf.readUInt32LE(this.offset)
    this.offset += 4
    return v
  }

  u64(): bigint {
    const v = this.buf.readBigUInt64LE(this.offset)
    this.offset += 8
    return v
  }

  i64(): bigint {
    const v = this.buf.readBigInt64LE(this.offset)
    this.offset += 8
    return v
  }

  pubkey(): PublicKey {
    const slice = this.buf.subarray(this.offset, this.offset + 32)
    this.offset += 32
    return new PublicKey(slice)
  }

  bytes(n: number): Buffer {
    const slice = this.buf.subarray(this.offset, this.offset + n)
    this.offset += n
    return Buffer.from(slice)
  }

  i32(): number {
    const v = this.buf.readInt32LE(this.offset)
    this.offset += 4
    return v
  }

  bool(): boolean {
    return this.u8() !== 0
  }

  string(): string {
    const len = this.u32()
    const bytes = this.bytes(len)
    return bytes.toString('utf8')
  }

  optionPubkey(): PublicKey | null {
    return this.u8() === 0 ? null : this.pubkey()
  }

  optionU32(): number | null {
    return this.u8() === 0 ? null : this.u32()
  }

  vecU64(): bigint[] {
    const len = this.u32()
    const out: bigint[] = new Array(len)
    for (let i = 0; i < len; i++) out[i] = this.u64()
    return out
  }

  vecPubkey(): PublicKey[] {
    const len = this.u32()
    const out: PublicKey[] = new Array(len)
    for (let i = 0; i < len; i++) out[i] = this.pubkey()
    return out
  }

  fixedU64Array(n: number): bigint[] {
    const out: bigint[] = new Array(n)
    for (let i = 0; i < n; i++) out[i] = this.u64()
    return out
  }
}

export type DeviceTypeName = 'Router' | 'WirelessRadio'
function decodeDeviceType(c: Cursor): DeviceTypeName {
  const tag = c.u8()
  if (tag === 0) return 'Router'
  if (tag === 1) return 'WirelessRadio'
  throw new Error(`unknown DeviceType tag ${tag}`)
}

export type IpTierName = 'Subscriber' | 'Loopback' | 'PtP'
function decodeIpTier(c: Cursor): IpTierName {
  const tag = c.u8()
  if (tag === 0) return 'Subscriber'
  if (tag === 1) return 'Loopback'
  if (tag === 2) return 'PtP'
  throw new Error(`unknown IpTier tag ${tag}`)
}

function checkDisc(buf: Buffer, expected: Buffer, name: string) {
  const got = buf.subarray(0, 8)
  if (!got.equals(expected)) {
    throw new Error(
      `${name} discriminator mismatch: got ${got.toString('hex')}, expected ${expected.toString('hex')}`,
    )
  }
}

// ---------------------------------------------------------------------------
// TokenConfig (state/token_config.rs)
// ---------------------------------------------------------------------------
export interface TokenConfigState {
  createdAt: bigint
  dawnMint: PublicKey
  mintBump: number
  feePoolBump: number
  daoBump: number
  validatorBump: number
  medallionBump: number
  bump: number
}

export function decodeTokenConfig(buf: Buffer): TokenConfigState {
  checkDisc(buf, ACCOUNT_DISC.TokenConfig, 'TokenConfig')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    dawnMint: c.pubkey(),
    mintBump: c.u8(),
    feePoolBump: c.u8(),
    daoBump: c.u8(),
    validatorBump: c.u8(),
    medallionBump: c.u8(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// Config (state/config.rs)
// ---------------------------------------------------------------------------
export interface ConfigState {
  createdAt: bigint
  authority: PublicKey
  apiAuthority: PublicKey
  tokenConfig: PublicKey
  stableMint: PublicKey
  dawnMint: PublicKey
  feePoolDawnAccount: PublicKey
  daoDawnAccount: PublicKey
  validatorDawnAccount: PublicKey
  medallionDawnAccount: PublicKey
  raydium: PublicKey
  raydiumAuthority: PublicKey
  raydiumConfig: PublicKey
  raydiumPool: PublicKey
  raydiumObservation: PublicKey
  daoFee: bigint
  validatorFee: bigint
  medallionFee: bigint
  bump: number
}

export function decodeConfig(buf: Buffer): ConfigState {
  checkDisc(buf, ACCOUNT_DISC.Config, 'Config')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    authority: c.pubkey(),
    apiAuthority: c.pubkey(),
    tokenConfig: c.pubkey(),
    stableMint: c.pubkey(),
    dawnMint: c.pubkey(),
    feePoolDawnAccount: c.pubkey(),
    daoDawnAccount: c.pubkey(),
    validatorDawnAccount: c.pubkey(),
    medallionDawnAccount: c.pubkey(),
    raydium: c.pubkey(),
    raydiumAuthority: c.pubkey(),
    raydiumConfig: c.pubkey(),
    raydiumPool: c.pubkey(),
    raydiumObservation: c.pubkey(),
    daoFee: c.u64(),
    validatorFee: c.u64(),
    medallionFee: c.u64(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// DeviceModel (state/device_model.rs)
// ---------------------------------------------------------------------------
export interface DeviceModelState {
  createdAt: bigint
  deviceType: DeviceTypeName
  manufacturer: string
  model: string
  bump: number
}

export function decodeDeviceModel(buf: Buffer): DeviceModelState {
  checkDisc(buf, ACCOUNT_DISC.DeviceModel, 'DeviceModel')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    deviceType: decodeDeviceType(c),
    manufacturer: c.string(),
    model: c.string(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// Device (state/device.rs)
// ---------------------------------------------------------------------------
export interface DeviceState {
  createdAt: bigint
  owner: PublicKey
  model: PublicKey
  name: string
  localDomain: PublicKey
  macAddress: Buffer
  bump: number
}

export function decodeDevice(buf: Buffer): DeviceState {
  checkDisc(buf, ACCOUNT_DISC.Device, 'Device')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    owner: c.pubkey(),
    model: c.pubkey(),
    name: c.string(),
    localDomain: c.pubkey(),
    macAddress: c.bytes(6),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// DeviceLocation (state/device_location.rs)
// ---------------------------------------------------------------------------
export interface DeviceLocationState {
  createdAt: bigint
  device: PublicKey
  height: number
  latitude: bigint
  longitude: bigint
  placement: [number, number]
  verified: boolean
  verifiedAt: bigint
  bump: number
}

export function decodeDeviceLocation(buf: Buffer): DeviceLocationState {
  checkDisc(buf, ACCOUNT_DISC.DeviceLocation, 'DeviceLocation')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    device: c.pubkey(),
    height: c.u16(),
    latitude: c.i64(),
    longitude: c.i64(),
    placement: [c.i32(), c.i32()],
    verified: c.bool(),
    verifiedAt: c.i64(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// LocalDomain (state/local_domain.rs)
//
// Extended with coverage_status + last_status_change_at — the BSS/OSS
// bridge trigger. Off-chain BSS systems treat these as "billing pause
// begins", OSS systems as "device provisioning hold".
// ---------------------------------------------------------------------------
export type CoverageStatusName =
  | 'Active'
  | 'Degraded'
  | 'Maintenance'
  | 'Offline'

const COVERAGE_STATUS_NAMES: CoverageStatusName[] = [
  'Active',
  'Degraded',
  'Maintenance',
  'Offline',
]

export interface LocalDomainState {
  createdAt: bigint
  name: string
  owner: PublicKey
  coverageStatus: CoverageStatusName
  coverageStatusCode: number
  lastStatusChangeAt: bigint
  bump: number
}

export function decodeLocalDomain(buf: Buffer): LocalDomainState {
  checkDisc(buf, ACCOUNT_DISC.LocalDomain, 'LocalDomain')
  const c = new Cursor(buf, 8)
  const createdAt = c.i64()
  const name = c.string()
  const owner = c.pubkey()
  const coverageStatusCode = c.u8()
  const lastStatusChangeAt = c.i64()
  const bump = c.u8()
  return {
    createdAt,
    name,
    owner,
    coverageStatus:
      COVERAGE_STATUS_NAMES[coverageStatusCode] ?? `Unknown(${coverageStatusCode})` as CoverageStatusName,
    coverageStatusCode,
    lastStatusChangeAt,
    bump,
  }
}

// ---------------------------------------------------------------------------
// ServiceAgreement (state/service_agreement.rs)
// ---------------------------------------------------------------------------
export interface ServiceAgreementState {
  createdAt: bigint
  threshold: bigint
  payoutRatio: bigint
  bump: number
}

export function decodeServiceAgreement(buf: Buffer): ServiceAgreementState {
  checkDisc(buf, ACCOUNT_DISC.ServiceAgreement, 'ServiceAgreement')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    threshold: c.u64(),
    payoutRatio: c.u64(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// Plan (state/plan.rs)
// ---------------------------------------------------------------------------
export interface PlanState {
  createdAt: bigint
  owner: PublicKey
  accessDomain: PublicKey | null
  distributionDomain: PublicKey | null
  localDomain: PublicKey
  parentPlan: PublicKey | null
  name: string
  price: bigint
  duration: number
  speed: number
  capacity: bigint
  startAt: bigint
  serviceAgreement: PublicKey
  authMethods: PublicKey[]
  bump: number
}

export function decodePlan(buf: Buffer): PlanState {
  checkDisc(buf, ACCOUNT_DISC.Plan, 'Plan')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    owner: c.pubkey(),
    accessDomain: c.optionPubkey(),
    distributionDomain: c.optionPubkey(),
    localDomain: c.pubkey(),
    parentPlan: c.optionPubkey(),
    name: c.string(),
    price: c.u64(),
    duration: c.u16(),
    speed: c.u32(),
    capacity: c.u64(),
    startAt: c.i64(),
    serviceAgreement: c.pubkey(),
    authMethods: c.vecPubkey(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// DistributionDomain (state/distribution_domain.rs)
// ---------------------------------------------------------------------------
export interface DistributionDomainState {
  createdAt: bigint
  owner: PublicKey
  localDomain: PublicKey
  bump: number
}

export function decodeDistributionDomain(buf: Buffer): DistributionDomainState {
  checkDisc(buf, ACCOUNT_DISC.DistributionDomain, 'DistributionDomain')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    owner: c.pubkey(),
    localDomain: c.pubkey(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// IpRegistry (state/ip_registry.rs)
// ---------------------------------------------------------------------------
export interface IpRegistryState {
  createdAt: bigint
  tier: IpTierName
  authority: PublicKey
  rootBlockCount: number
  nextIndex: number
  rootAvailabilityBitmap: bigint[] // [u64; 4]
  bump: number
}

export function decodeIpRegistry(buf: Buffer): IpRegistryState {
  checkDisc(buf, ACCOUNT_DISC.IpRegistry, 'IpRegistry')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    tier: decodeIpTier(c),
    authority: c.pubkey(),
    rootBlockCount: c.u32(),
    nextIndex: c.u32(),
    rootAvailabilityBitmap: c.fixedU64Array(4),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// RootIpBlock (state/root_ip_block.rs)
// ---------------------------------------------------------------------------
export interface RootIpBlockState {
  createdAt: bigint
  tier: IpTierName
  authority: PublicKey
  index: number
  baseIpv4: number
  baseCidr: number
  blockCidr: number
  rootChunks: bigint[]
  rootSummary64: bigint
  firstAvailableBlockIdx: number | null
  bump: number
}

export function decodeRootIpBlock(buf: Buffer): RootIpBlockState {
  checkDisc(buf, ACCOUNT_DISC.RootIpBlock, 'RootIpBlock')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    tier: decodeIpTier(c),
    authority: c.pubkey(),
    index: c.u32(),
    baseIpv4: c.u32(),
    baseCidr: c.u8(),
    blockCidr: c.u8(),
    rootChunks: c.vecU64(),
    rootSummary64: c.u64(),
    firstAvailableBlockIdx: c.optionU32(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// IpBlock (state/ip_block.rs)
// ---------------------------------------------------------------------------
export interface IpBlockState {
  createdAt: bigint
  tier: IpTierName
  rootBlockIndex: number
  blockBase: number
  blockCidr: number
  unitCapacity: number
  freeUnits: number
  slotsChunks: bigint[]
  chunkFreeBitmap: number
  bump: number
}

export function decodeIpBlock(buf: Buffer): IpBlockState {
  checkDisc(buf, ACCOUNT_DISC.IpBlock, 'IpBlock')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    tier: decodeIpTier(c),
    rootBlockIndex: c.u32(),
    blockBase: c.u32(),
    blockCidr: c.u8(),
    unitCapacity: c.u16(),
    freeUnits: c.u16(),
    slotsChunks: c.vecU64(),
    chunkFreeBitmap: c.u16(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// IpLease (state/ip_lease.rs)
// ---------------------------------------------------------------------------
export interface IpLeaseState {
  createdAt: bigint
  tier: IpTierName
  seedKey: PublicKey
  device: PublicKey | null
  ipv4: Buffer // [u8; 4] big-endian
  ipv4CidrMask: number
  blockIndex: number
  unitIndex: number
  bump: number
}

export function decodeIpLease(buf: Buffer): IpLeaseState {
  checkDisc(buf, ACCOUNT_DISC.IpLease, 'IpLease')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    tier: decodeIpTier(c),
    seedKey: c.pubkey(),
    device: c.optionPubkey(),
    ipv4: c.bytes(4),
    ipv4CidrMask: c.u8(),
    blockIndex: c.u32(),
    unitIndex: c.u32(),
    bump: c.u8(),
  }
}

/** Format an IpLease.ipv4 (big-endian bytes) as dotted-quad string. */
export function formatIpv4(ipv4: Buffer): string {
  return `${ipv4[0]}.${ipv4[1]}.${ipv4[2]}.${ipv4[3]}`
}

// ---------------------------------------------------------------------------
// AccessDomain (state/access_domain.rs)
// Same shape as DistributionDomain.
// ---------------------------------------------------------------------------
export interface AccessDomainState {
  createdAt: bigint
  owner: PublicKey
  localDomain: PublicKey
  bump: number
}

export function decodeAccessDomain(buf: Buffer): AccessDomainState {
  checkDisc(buf, ACCOUNT_DISC.AccessDomain, 'AccessDomain')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    owner: c.pubkey(),
    localDomain: c.pubkey(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// AuthMethod (state/auth_method.rs)
// ---------------------------------------------------------------------------
export type AuthMethodTypeName =
  | 'Psk'
  | 'Mpsk'
  | 'Wpa2Enterprise'
  | 'Eap'
  | 'IpsecAh'
  | 'Wpa3Enterprise'

function decodeAuthMethodType(c: Cursor): AuthMethodTypeName {
  const tag = c.u8()
  const variants: AuthMethodTypeName[] = [
    'Psk',
    'Mpsk',
    'Wpa2Enterprise',
    'Eap',
    'IpsecAh',
    'Wpa3Enterprise',
  ]
  const v = variants[tag]
  if (!v) throw new Error(`unknown AuthMethodType tag ${tag}`)
  return v
}

export interface AuthMethodState {
  createdAt: bigint
  authority: PublicKey
  methodType: AuthMethodTypeName
  device: PublicKey
  encryptionKey: Buffer // [u8; 32]
  parameters: Buffer // [u8; 256]
  bump: number
}

export function decodeAuthMethod(buf: Buffer): AuthMethodState {
  checkDisc(buf, ACCOUNT_DISC.AuthMethod, 'AuthMethod')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    authority: c.pubkey(),
    methodType: decodeAuthMethodType(c),
    device: c.pubkey(),
    encryptionKey: c.bytes(32),
    parameters: c.bytes(256),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// Credential (state/credential.rs)
// ---------------------------------------------------------------------------
export interface CredentialState {
  createdAt: bigint
  authority: PublicKey
  plan: PublicKey
  subscription: PublicKey
  authMethod: PublicKey
  credentialData: Buffer // [u8; 128]
  bump: number
}

export function decodeCredential(buf: Buffer): CredentialState {
  checkDisc(buf, ACCOUNT_DISC.Credential, 'Credential')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    authority: c.pubkey(),
    plan: c.pubkey(),
    subscription: c.pubkey(),
    authMethod: c.pubkey(),
    credentialData: c.bytes(128),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// Connection (state/connection.rs)
// ---------------------------------------------------------------------------
export interface ConnectionState {
  createdAt: bigint
  authMethod: PublicKey
  entityA: PublicKey
  entityB: PublicKey
  credentialDataA: Buffer // [u8; 64]
  credentialDataB: Buffer // [u8; 64]
  bump: number
}

export function decodeConnection(buf: Buffer): ConnectionState {
  checkDisc(buf, ACCOUNT_DISC.Connection, 'Connection')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    authMethod: c.pubkey(),
    entityA: c.pubkey(),
    entityB: c.pubkey(),
    credentialDataA: c.bytes(64),
    credentialDataB: c.bytes(64),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// Subscription (state/subscription.rs)
// ---------------------------------------------------------------------------
export interface SubscriptionState {
  createdAt: bigint
  plan: PublicKey
  subscriber: PublicKey
  device: PublicKey | null
  expiration: bigint
  lastClaim: bigint
  claimableDawn: bigint
  dailyStable: bigint
  bump: number
}

export function decodeSubscription(buf: Buffer): SubscriptionState {
  checkDisc(buf, ACCOUNT_DISC.Subscription, 'Subscription')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    plan: c.pubkey(),
    subscriber: c.pubkey(),
    device: c.optionPubkey(),
    expiration: c.i64(),
    lastClaim: c.i64(),
    claimableDawn: c.u64(),
    dailyStable: c.u64(),
    bump: c.u8(),
  }
}
