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

  optionU16(): number | null {
    return this.u8() === 0 ? null : this.u16()
  }

  optionU8(): number | null {
    return this.u8() === 0 ? null : this.u8()
  }

  optionFixedBytes(n: number): Buffer | null {
    return this.u8() === 0 ? null : this.bytes(n)
  }

  optionString(): string | null {
    return this.u8() === 0 ? null : this.string()
  }

  optionI64(): bigint | null {
    return this.u8() === 0 ? null : this.i64()
  }
}

export type DeviceTypeName = 'Router' | 'WirelessRadio'
function decodeDeviceType(c: Cursor): DeviceTypeName {
  const tag = c.u8()
  if (tag === 0) return 'Router'
  if (tag === 1) return 'WirelessRadio'
  throw new Error(`unknown DeviceType tag ${tag}`)
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
// Config (state/config.rs) — lean access-domain build: just (authority, bump).
// ---------------------------------------------------------------------------
export interface ConfigState {
  createdAt: bigint
  authority: PublicKey
  bump: number
}

export function decodeConfig(buf: Buffer): ConfigState {
  checkDisc(buf, ACCOUNT_DISC.Config, 'Config')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    authority: c.pubkey(),
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
// coverage_status + last_status_change_at — the BSS/OSS bridge trigger.
// Off-chain BSS systems treat these as "billing pause begins", OSS systems
// as "device provisioning hold".
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
// AccessDomain (state/access_domain.rs) — top-level, with control_plane_device,
// optional gateway_device, optional local_domain, optional external_uuid, name.
// ---------------------------------------------------------------------------
export interface AccessDomainState {
  createdAt: bigint
  owner: PublicKey
  controlPlaneDevice: PublicKey
  gatewayDevice: PublicKey | null
  localDomain: PublicKey | null
  externalUuid: Buffer | null
  name: string
  bump: number
}

export function decodeAccessDomain(buf: Buffer): AccessDomainState {
  checkDisc(buf, ACCOUNT_DISC.AccessDomain, 'AccessDomain')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    owner: c.pubkey(),
    controlPlaneDevice: c.pubkey(),
    gatewayDevice: c.optionPubkey(),
    localDomain: c.optionPubkey(),
    externalUuid: c.optionFixedBytes(16),
    name: c.string(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// DomainAuthority (state/domain_authority.rs) — Tier-2 role grant
// ---------------------------------------------------------------------------
export type DomainAuthorityRoleName = 'Registrar' | 'ConfigPlaneManager'

function decodeDomainAuthorityRole(c: Cursor): DomainAuthorityRoleName {
  const tag = c.u8()
  if (tag === 0) return 'Registrar'
  if (tag === 1) return 'ConfigPlaneManager'
  throw new Error(`unknown DomainAuthorityRole tag ${tag}`)
}

export interface DomainAuthorityState {
  createdAt: bigint
  domain: PublicKey
  authority: PublicKey
  role: DomainAuthorityRoleName
  createdBy: PublicKey
  label: string | null
  expiresAt: bigint | null
  bump: number
}

export function decodeDomainAuthority(buf: Buffer): DomainAuthorityState {
  checkDisc(buf, ACCOUNT_DISC.DomainAuthority, 'DomainAuthority')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    domain: c.pubkey(),
    authority: c.pubkey(),
    role: decodeDomainAuthorityRole(c),
    createdBy: c.pubkey(),
    label: c.optionString(),
    expiresAt: c.optionI64(),
    bump: c.u8(),
  }
}

// ---------------------------------------------------------------------------
// AuthMethod (state/auth_method.rs)
// Lean build: only Psk + Mpsk variants are accepted on-chain. We keep
// the wire enum permissive (decode tags 0..=5) so a future expansion of
// the set doesn't require a decoder change.
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
  accessDomain: PublicKey
  methodType: AuthMethodTypeName
  parameters: Buffer // [u8; 256]
  bump: number
}

export function decodeAuthMethod(buf: Buffer): AuthMethodState {
  checkDisc(buf, ACCOUNT_DISC.AuthMethod, 'AuthMethod')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    authority: c.pubkey(),
    accessDomain: c.pubkey(),
    methodType: decodeAuthMethodType(c),
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
  accessDomain: PublicKey
  authMethod: PublicKey
  subscription: PublicKey | null
  plan: PublicKey | null
  vlanId: number | null
  qosTag: number | null
  sealedPayload: Buffer // [u8; 128]
  bump: number
}

export function decodeCredential(buf: Buffer): CredentialState {
  checkDisc(buf, ACCOUNT_DISC.Credential, 'Credential')
  const c = new Cursor(buf, 8)
  return {
    createdAt: c.i64(),
    authority: c.pubkey(),
    accessDomain: c.pubkey(),
    authMethod: c.pubkey(),
    subscription: c.optionPubkey(),
    plan: c.optionPubkey(),
    vlanId: c.optionU16(),
    qosTag: c.optionU8(),
    sealedPayload: c.bytes(128),
    bump: c.u8(),
  }
}
