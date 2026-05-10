import {
  AccountMeta,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js'

import {
  DAWN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from './program'
import { IX_DISC } from './discriminators'
import { AuthMethodType, DeviceType, DomainAuthorityRole } from './pda'

/**
 * Each instruction has a corresponding `build*` function here that
 * takes the named accounts (as PublicKeys) and any args, and returns
 * a fully-formed TransactionInstruction ready to be signed and sent.
 *
 * Account ordering must exactly match the `#[derive(Accounts)]` struct
 * field order in the program's app/*.rs file. Comments below cite the
 * source file and field for each entry.
 */

// ---------------------------------------------------------------------------
// Borsh encoding helpers
// ---------------------------------------------------------------------------

function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s, 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(bytes.length, 0)
  return Buffer.concat([len, bytes])
}

function encodeOptionPubkey(v: PublicKey | null): Buffer {
  if (v === null) return Buffer.from([0])
  return Buffer.concat([Buffer.from([1]), Buffer.from(v.toBytes())])
}

function encodeOptionFixed(v: Buffer | Uint8Array | null, n: number): Buffer {
  if (v === null) return Buffer.from([0])
  if (v.length !== n) throw new Error(`option<[u8;${n}]>: expected ${n} bytes, got ${v.length}`)
  return Buffer.concat([Buffer.from([1]), Buffer.from(v)])
}

function encodeOptionU16(v: number | null): Buffer {
  if (v === null) return Buffer.from([0])
  const out = Buffer.alloc(3)
  out[0] = 1
  out.writeUInt16LE(v >>> 0, 1)
  return out
}

function encodeOptionU8(v: number | null): Buffer {
  if (v === null) return Buffer.from([0])
  return Buffer.from([1, v & 0xff])
}

function encodeOptionString(v: string | null): Buffer {
  if (v === null) return Buffer.from([0])
  return Buffer.concat([Buffer.from([1]), encodeString(v)])
}

function encodeOptionI64(v: bigint | null): Buffer {
  if (v === null) return Buffer.from([0])
  const out = Buffer.alloc(9)
  out[0] = 1
  out.writeBigInt64LE(v, 1)
  return out
}

function meta(
  pubkey: PublicKey,
  isSigner: boolean,
  isWritable: boolean,
): AccountMeta {
  return { pubkey, isSigner, isWritable }
}

// ---------------------------------------------------------------------------
// initialize_config (no args; cold-admin authority captured from caller)
// app/initialize_config.rs
// ---------------------------------------------------------------------------
export interface InitializeConfigAccounts {
  caller: PublicKey
  config: PublicKey
}

export function buildInitializeConfig(
  a: InitializeConfigAccounts,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),
      meta(a.config, false, true),
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data: Buffer.from(IX_DISC.initialize_config),
  })
}

// ---------------------------------------------------------------------------
// update_config_authority(new_authority: Pubkey)
// app/update_config.rs
// ---------------------------------------------------------------------------
export interface UpdateConfigAuthorityAccounts {
  caller: PublicKey
  config: PublicKey
}

export function buildUpdateConfigAuthority(
  a: UpdateConfigAuthorityAccounts,
  newAuthority: PublicKey,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),
      meta(a.config, false, true),
    ],
    data: Buffer.concat([
      IX_DISC.update_config_authority,
      Buffer.from(newAuthority.toBytes()),
    ]),
  })
}

// ---------------------------------------------------------------------------
// add_device_model(device_type: DeviceType, manufacturer: String, model: String)
// app/device/add_device_model.rs AddDeviceModel<'info>
// ---------------------------------------------------------------------------
export interface AddDeviceModelAccounts {
  caller: PublicKey
  config: PublicKey
  deviceModel: PublicKey
}

export interface AddDeviceModelArgs {
  deviceType: DeviceType
  manufacturer: string
  model: string
}

export function buildAddDeviceModel(
  a: AddDeviceModelAccounts,
  args: AddDeviceModelArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.concat([
    IX_DISC.add_device_model,
    Buffer.from([args.deviceType]), // enum variant tag (1 byte)
    encodeString(args.manufacturer),
    encodeString(args.model),
  ])
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),         // caller
      meta(a.config, false, false),       // config
      meta(a.deviceModel, false, true),   // device_model (init)
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// add_device(name, height, latitude, longitude, placement, mac_address, local_domain_name)
// app/device/add_device.rs AddDevice<'info>
// ---------------------------------------------------------------------------
export interface AddDeviceAccounts {
  caller: PublicKey
  deviceModel: PublicKey
  device: PublicKey
  deviceLocation: PublicKey
  localDomain: PublicKey
}

export interface AddDeviceArgs {
  name: string
  height: number
  latitude: bigint
  longitude: bigint
  placement: [number, number] // [azimuth, tilt] both i32 scaled ×100
  macAddress: number[] | Uint8Array // exactly 6 bytes
  localDomainName: string
}

export function buildAddDevice(
  a: AddDeviceAccounts,
  args: AddDeviceArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const argsBuf = Buffer.alloc(2 + 8 + 8 + 4 + 4 + 6)
  let o = 0
  argsBuf.writeUInt16LE(args.height, o); o += 2
  argsBuf.writeBigInt64LE(args.latitude, o); o += 8
  argsBuf.writeBigInt64LE(args.longitude, o); o += 8
  argsBuf.writeInt32LE(args.placement[0], o); o += 4
  argsBuf.writeInt32LE(args.placement[1], o); o += 4
  Buffer.from(args.macAddress as any).copy(argsBuf, o)

  const data = Buffer.concat([
    IX_DISC.add_device,
    encodeString(args.name),
    argsBuf,
    encodeString(args.localDomainName),
  ])
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),             // caller
      meta(a.deviceModel, false, false),      // device_model
      meta(a.device, false, true),            // device (init)
      meta(a.deviceLocation, false, true),    // device_location (init)
      meta(a.localDomain, false, true),       // local_domain (init_if_needed)
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// add_device_for(name, height, latitude, longitude, placement, mac_address, local_domain_name)
// app/device/add_device_for.rs AddDeviceFor<'info>
//
// Same wire shape as add_device but with an extra `beneficiary` account
// in slot 1. The caller pays rent; the resulting Device.owner is the
// beneficiary. Used when one party (e.g. operator) registers a Device on
// behalf of another (e.g. SoT-bridge node) so the beneficiary's secret
// key can later decrypt sealed credential payloads.
// ---------------------------------------------------------------------------
export interface AddDeviceForAccounts {
  caller: PublicKey
  beneficiary: PublicKey
  deviceModel: PublicKey
  device: PublicKey
  deviceLocation: PublicKey
  localDomain: PublicKey
}

export function buildAddDeviceFor(
  a: AddDeviceForAccounts,
  args: AddDeviceArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const argsBuf = Buffer.alloc(2 + 8 + 8 + 4 + 4 + 6)
  let o = 0
  argsBuf.writeUInt16LE(args.height, o); o += 2
  argsBuf.writeBigInt64LE(args.latitude, o); o += 8
  argsBuf.writeBigInt64LE(args.longitude, o); o += 8
  argsBuf.writeInt32LE(args.placement[0], o); o += 4
  argsBuf.writeInt32LE(args.placement[1], o); o += 4
  Buffer.from(args.macAddress as any).copy(argsBuf, o)

  const data = Buffer.concat([
    IX_DISC.add_device_for,
    encodeString(args.name),
    argsBuf,
    encodeString(args.localDomainName),
  ])
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),             // caller (signer, mut, payer)
      meta(a.beneficiary, false, false),      // beneficiary (becomes owner)
      meta(a.deviceModel, false, false),      // device_model
      meta(a.device, false, true),            // device (init, seeds use beneficiary)
      meta(a.deviceLocation, false, true),    // device_location (init)
      meta(a.localDomain, false, true),       // local_domain (init_if_needed)
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// update_local_domain_status(new_status: u8)
// app/local_domain/update_status.rs UpdateLocalDomainStatus<'info>
//
// Mutates the LocalDomain coverage_status + last_status_change_at fields.
// Caller must be the domain's owner (the SP). The new_status is one of
// 0=Active, 1=Degraded, 2=Maintenance, 3=Offline.
// ---------------------------------------------------------------------------
export interface UpdateLocalDomainStatusAccounts {
  caller: PublicKey
  localDomain: PublicKey
}

export interface UpdateLocalDomainStatusArgs {
  newStatus: number // 0..=3
}

export function buildUpdateLocalDomainStatus(
  a: UpdateLocalDomainStatusAccounts,
  args: UpdateLocalDomainStatusArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.alloc(8 + 1)
  IX_DISC.update_local_domain_status.copy(data, 0)
  data.writeUInt8(args.newStatus, 8)
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),         // caller (signer, mut)
      meta(a.localDomain, false, true),   // local_domain (mut)
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// add_access_domain(name, control_plane_device, gateway_device,
//                   local_domain, external_uuid)
// app/access_domain/add_access_domain.rs AddAccessDomain<'info>
//
// PDA seeds: ["access_domain", caller, hash(name)].
// `control_plane_device` is required (Device PDA whose owner decrypts
// credential payloads). `gateway_device`, `local_domain`, `external_uuid`
// are optional.
// ---------------------------------------------------------------------------
export interface AddAccessDomainAccounts {
  caller: PublicKey
  accessDomain: PublicKey
}

export interface AddAccessDomainArgs {
  name: string
  controlPlaneDevice: PublicKey
  gatewayDevice: PublicKey | null
  localDomain: PublicKey | null
  externalUuid: Buffer | Uint8Array | null // 16 bytes when present
}

export function buildAddAccessDomain(
  a: AddAccessDomainAccounts,
  args: AddAccessDomainArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.concat([
    IX_DISC.add_access_domain,
    encodeString(args.name),
    Buffer.from(args.controlPlaneDevice.toBytes()),
    encodeOptionPubkey(args.gatewayDevice),
    encodeOptionPubkey(args.localDomain),
    encodeOptionFixed(args.externalUuid, 16),
  ])
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),         // caller (signer, mut, becomes owner)
      meta(a.accessDomain, false, true),  // access_domain (init)
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// set_control_plane_device(new_control_plane_device: Pubkey)
// ---------------------------------------------------------------------------
export interface SetControlPlaneDeviceAccounts {
  caller: PublicKey
  accessDomain: PublicKey
}

export function buildSetControlPlaneDevice(
  a: SetControlPlaneDeviceAccounts,
  newControlPlaneDevice: PublicKey,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.concat([
    IX_DISC.set_control_plane_device,
    Buffer.from(newControlPlaneDevice.toBytes()),
  ])
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),
      meta(a.accessDomain, false, true),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// set_access_domain_gateway_device(new_gateway_device: Option<Pubkey>)
// ---------------------------------------------------------------------------
export interface SetAccessDomainGatewayAccounts {
  caller: PublicKey
  accessDomain: PublicKey
}

export function buildSetAccessDomainGatewayDevice(
  a: SetAccessDomainGatewayAccounts,
  newGatewayDevice: PublicKey | null,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.concat([
    IX_DISC.set_access_domain_gateway_device,
    encodeOptionPubkey(newGatewayDevice),
  ])
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),
      meta(a.accessDomain, false, true),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// grant_domain_authority_for_access_domain(role, authority, label?, expires_at?)
// app/domain_authority/grant_domain_authority.rs
//
// Caller must equal access_domain.owner. PDA seeds:
//   ["domain_authority", access_domain, role_byte, authority]
// ---------------------------------------------------------------------------
export interface GrantDomainAuthorityForAccessDomainAccounts {
  caller: PublicKey
  accessDomain: PublicKey
  domainAuthority: PublicKey
}

export interface GrantDomainAuthorityForAccessDomainArgs {
  role: DomainAuthorityRole
  authority: PublicKey
  label: string | null
  expiresAt: bigint | null
}

export function buildGrantDomainAuthorityForAccessDomain(
  a: GrantDomainAuthorityForAccessDomainAccounts,
  args: GrantDomainAuthorityForAccessDomainArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.concat([
    IX_DISC.grant_domain_authority_for_access_domain,
    Buffer.from([args.role]),
    Buffer.from(args.authority.toBytes()),
    encodeOptionString(args.label),
    encodeOptionI64(args.expiresAt),
  ])
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),
      meta(a.accessDomain, false, false),
      meta(a.domainAuthority, false, true), // init
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// revoke_domain_authority_for_access_domain (no args)
// ---------------------------------------------------------------------------
export interface RevokeDomainAuthorityForAccessDomainAccounts {
  caller: PublicKey
  accessDomain: PublicKey
  domainAuthority: PublicKey
}

export function buildRevokeDomainAuthorityForAccessDomain(
  a: RevokeDomainAuthorityForAccessDomainAccounts,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.from(IX_DISC.revoke_domain_authority_for_access_domain)
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),
      meta(a.accessDomain, false, false),
      meta(a.domainAuthority, false, true), // close = caller
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// register_auth_method(method_type, parameters[256])
// app/amf/register_auth_method.rs
//
// Caller must equal access_domain.owner. PDA seeds:
//   ["auth_method", access_domain, method_type_byte]
// ---------------------------------------------------------------------------
export interface RegisterAuthMethodAccounts {
  caller: PublicKey
  accessDomain: PublicKey
  authMethod: PublicKey
}

export interface RegisterAuthMethodArgs {
  methodType: AuthMethodType
  parameters: Buffer | Uint8Array // 256 bytes
}

export function buildRegisterAuthMethod(
  a: RegisterAuthMethodAccounts,
  args: RegisterAuthMethodArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  if (args.parameters.length !== 256) {
    throw new Error('parameters must be 256 bytes')
  }
  const data = Buffer.concat([
    IX_DISC.register_auth_method,
    Buffer.from([args.methodType]),
    Buffer.from(args.parameters),
  ])
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),         // caller (= access_domain.owner)
      meta(a.accessDomain, false, false), // access_domain
      meta(a.authMethod, false, true),    // auth_method (init)
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// update_auth_method_params(new_parameters: [u8; 256])
// app/amf/update_auth_method_params.rs
//
// Same PDA as register_auth_method — mutates params in place. Caller is
// either access_domain.owner or a live ConfigPlaneManager DomainAuthority.
// Pass the optional ConfigPlaneManager PDA when caller != owner.
// ---------------------------------------------------------------------------
export interface UpdateAuthMethodParamsAccounts {
  caller: PublicKey
  accessDomain: PublicKey
  authMethod: PublicKey
  configPlaneManager: PublicKey | null // Optional DomainAuthority (role=CPM)
}

export interface UpdateAuthMethodParamsArgs {
  newParameters: Buffer | Uint8Array // 256 bytes
}

export function buildUpdateAuthMethodParams(
  a: UpdateAuthMethodParamsAccounts,
  args: UpdateAuthMethodParamsArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  if (args.newParameters.length !== 256) {
    throw new Error('newParameters must be 256 bytes')
  }
  const data = Buffer.concat([
    IX_DISC.update_auth_method_params,
    Buffer.from(args.newParameters),
  ])
  // Anchor convention for Optional<Account>: pass programId for None.
  const cpmKey = a.configPlaneManager ?? programId
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),
      meta(a.accessDomain, false, false),
      meta(a.authMethod, false, true),
      meta(cpmKey, false, false),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// register_credential_for(vlan_id, qos_tag, sealed_payload)
// app/amf/register_credential_for.rs
//
// Two authorization regimes (resolved server-side):
//   BSS w/ Registrar: registrar is Some — caller == registrar.authority
//   BSS direct:       registrar is None — caller == access_domain.owner
// PDA seeds: ["credential", access_domain, auth_method, beneficiary]
// ---------------------------------------------------------------------------
export interface RegisterCredentialForAccounts {
  caller: PublicKey
  beneficiary: PublicKey
  accessDomain: PublicKey
  authMethod: PublicKey
  registrar: PublicKey | null  // Optional DomainAuthority (Registrar) PDA
  credential: PublicKey
}

export interface RegisterCredentialForArgs {
  vlanId: number | null
  qosTag: number | null
  sealedPayload: Buffer | Uint8Array // 128 bytes
}

export function buildRegisterCredentialFor(
  a: RegisterCredentialForAccounts,
  args: RegisterCredentialForArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  if (args.sealedPayload.length !== 128) {
    throw new Error('sealedPayload must be 128 bytes')
  }
  const data = Buffer.concat([
    IX_DISC.register_credential_for,
    encodeOptionU16(args.vlanId),
    encodeOptionU8(args.qosTag),
    Buffer.from(args.sealedPayload),
  ])
  // Anchor convention for Optional<Account>: pass programId for None.
  const registrarKey = a.registrar ?? programId
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),
      meta(a.beneficiary, false, false),
      meta(a.accessDomain, false, false),
      meta(a.authMethod, false, false),
      meta(registrarKey, false, false),
      meta(a.credential, false, true),
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// revoke_credential (no args)
// Caller must be the credential authority OR the access_domain owner.
// ---------------------------------------------------------------------------
export interface RevokeCredentialAccounts {
  caller: PublicKey
  accessDomain: PublicKey
  authMethod: PublicKey
  credential: PublicKey
}

export function buildRevokeCredential(
  a: RevokeCredentialAccounts,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.from(IX_DISC.revoke_credential)
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),
      meta(a.accessDomain, false, false),
      meta(a.authMethod, false, false),
      meta(a.credential, false, true), // close = caller
    ],
    data,
  })
}
