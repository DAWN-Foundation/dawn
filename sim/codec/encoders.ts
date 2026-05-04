import {
  AccountMeta,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js'

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  DAWN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  SYSVAR_RENT_PUBKEY,
  TOKEN_PROGRAM_ID,
} from './program'
import { IX_DISC } from './discriminators'
import { DeviceType, IpTier } from './pda'

// ---------------------------------------------------------------------------
// Borsh encoding helpers
// ---------------------------------------------------------------------------

function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s, 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(bytes.length, 0)
  return Buffer.concat([len, bytes])
}

function encodeOptionI64(v: bigint | null): Buffer {
  if (v === null) return Buffer.from([0])
  const out = Buffer.alloc(9)
  out[0] = 1
  out.writeBigInt64LE(v, 1)
  return out
}

/**
 * Each instruction has a corresponding `build*` function here that
 * takes the named accounts (as PublicKeys) and any args, and returns
 * a fully-formed TransactionInstruction ready to be signed and sent.
 *
 * Account ordering must exactly match the `#[derive(Accounts)]` struct
 * field order in the program's app/*.rs file. Comments below cite the
 * source file and field for each entry.
 */

function meta(
  pubkey: PublicKey,
  isSigner: boolean,
  isWritable: boolean,
): AccountMeta {
  return { pubkey, isSigner, isWritable }
}

// ---------------------------------------------------------------------------
// init_token (no args)
// app/init_token.rs InitializeToken<'info>
// ---------------------------------------------------------------------------
export interface InitTokenAccounts {
  caller: PublicKey
  tokenConfig: PublicKey
  dawnMint: PublicKey
  callerDawnAccount: PublicKey
}

export function buildInitToken(
  a: InitTokenAccounts,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),                  // caller
      meta(a.tokenConfig, false, true),            // token_config (init)
      meta(a.dawnMint, false, true),               // dawn_mint (init)
      meta(a.callerDawnAccount, false, true),      // caller_dawn_account (init ATA)
      meta(TOKEN_PROGRAM_ID, false, false),        // token_program
      meta(ASSOCIATED_TOKEN_PROGRAM_ID, false, false), // associated_token_program
      meta(SYSTEM_PROGRAM_ID, false, false),       // system_program
    ],
    data: IX_DISC.init_token,
  })
}

// ---------------------------------------------------------------------------
// init_fee_accounts (no args)
// app/init_fee_accounts.rs InitializeFeeAccounts<'info>
// ---------------------------------------------------------------------------
export interface InitFeeAccountsAccounts {
  caller: PublicKey
  tokenConfig: PublicKey
  dawnMint: PublicKey
  feePoolDawnAccount: PublicKey
  daoDawnAccount: PublicKey
  validatorDawnAccount: PublicKey
  medallionDawnAccount: PublicKey
}

export function buildInitFeeAccounts(
  a: InitFeeAccountsAccounts,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),                       // caller
      meta(a.tokenConfig, false, true),                 // token_config (mut, sets bumps)
      meta(a.dawnMint, false, false),                   // dawn_mint
      meta(a.feePoolDawnAccount, false, true),          // fee_pool_dawn_account (init)
      meta(a.daoDawnAccount, false, true),              // dao_dawn_account (init)
      meta(a.validatorDawnAccount, false, true),        // validator_dawn_account (init)
      meta(a.medallionDawnAccount, false, true),        // medallion_dawn_account (init)
      meta(TOKEN_PROGRAM_ID, false, false),             // token_program
      meta(SYSTEM_PROGRAM_ID, false, false),            // system_program
    ],
    data: IX_DISC.init_fee_accounts,
  })
}

// ---------------------------------------------------------------------------
// initialize_config(dao_fee: u64, validator_fee: u64, medallion_fee: u64)
// app/initialize_config.rs InitializeConfig<'info>
// ---------------------------------------------------------------------------
export interface InitializeConfigAccounts {
  caller: PublicKey
  apiAuthority: PublicKey
  config: PublicKey
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
}

export interface InitializeConfigArgs {
  daoFee: bigint
  validatorFee: bigint
  medallionFee: bigint
}

export function buildInitializeConfig(
  a: InitializeConfigAccounts,
  args: InitializeConfigArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  // Encode args: 3 × u64 little-endian
  const data = Buffer.alloc(8 + 8 + 8 + 8)
  IX_DISC.initialize_config.copy(data, 0)
  data.writeBigUInt64LE(args.daoFee, 8)
  data.writeBigUInt64LE(args.validatorFee, 16)
  data.writeBigUInt64LE(args.medallionFee, 24)

  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),                      // caller
      meta(a.apiAuthority, false, true),               // api_authority (mut, UncheckedAccount)
      meta(a.config, false, true),                     // config (init)
      meta(a.tokenConfig, false, false),               // token_config
      meta(a.stableMint, false, false),                // stable_mint
      meta(a.dawnMint, false, false),                  // dawn_mint
      meta(a.feePoolDawnAccount, false, false),        // fee_pool_dawn_account
      meta(a.daoDawnAccount, false, false),            // dao_dawn_account
      meta(a.validatorDawnAccount, false, false),      // validator_dawn_account
      meta(a.medallionDawnAccount, false, false),      // medallion_dawn_account
      meta(a.raydium, false, false),                   // raydium (UncheckedAccount)
      meta(a.raydiumAuthority, false, false),          // raydium_authority
      meta(a.raydiumConfig, false, false),             // raydium_config
      meta(a.raydiumPool, false, false),               // raydium_pool
      meta(a.raydiumObservation, false, false),        // raydium_observation
      meta(TOKEN_PROGRAM_ID, false, false),            // token_program
      meta(SYSTEM_PROGRAM_ID, false, false),           // system_program
      meta(SYSVAR_RENT_PUBKEY, false, false),          // rent
    ],
    data,
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
// add_service_agreement(threshold: u64, payout_ratio: u64)
// app/plan/service_agreement.rs AddServiceAgreement<'info>
// ---------------------------------------------------------------------------
export interface AddServiceAgreementAccounts {
  caller: PublicKey
  config: PublicKey
  serviceAgreement: PublicKey
}

export interface AddServiceAgreementArgs {
  threshold: bigint
  payoutRatio: bigint
}

export function buildAddServiceAgreement(
  a: AddServiceAgreementAccounts,
  args: AddServiceAgreementArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.alloc(8 + 8 + 8)
  IX_DISC.add_service_agreement.copy(data, 0)
  data.writeBigUInt64LE(args.threshold, 8)
  data.writeBigUInt64LE(args.payoutRatio, 16)
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),             // caller
      meta(a.config, false, false),           // config
      meta(a.serviceAgreement, false, true),  // service_agreement (init)
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// add_l3_plan(name, price, duration, speed, capacity, start_at)
// app/plan/add_l3_plan.rs AddL3Plan<'info>
//
// Note: the program reads auth_methods from `ctx.remaining_accounts`. To pass
// auth methods, append additional AccountMeta entries to `keys` after the
// fixed accounts. For the milestone we pass none.
// ---------------------------------------------------------------------------
export interface AddL3PlanAccounts {
  caller: PublicKey
  serviceAgreement: PublicKey
  plan: PublicKey
  localDomain: PublicKey
  distributionDomain: PublicKey
  authMethods?: PublicKey[] // remaining_accounts
}

export interface AddL3PlanArgs {
  name: string
  price: bigint
  duration: number
  speed: number
  capacity: bigint
  startAt: bigint | null
}

export function buildAddL3Plan(
  a: AddL3PlanAccounts,
  args: AddL3PlanArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const fixedArgs = Buffer.alloc(8 + 2 + 4 + 8)
  let o = 0
  fixedArgs.writeBigUInt64LE(args.price, o); o += 8
  fixedArgs.writeUInt16LE(args.duration, o); o += 2
  fixedArgs.writeUInt32LE(args.speed, o); o += 4
  fixedArgs.writeBigUInt64LE(args.capacity, o); o += 8

  const data = Buffer.concat([
    IX_DISC.add_l3_plan,
    encodeString(args.name),
    fixedArgs,
    encodeOptionI64(args.startAt),
  ])

  const remaining = (a.authMethods ?? []).map((k) => meta(k, false, false))

  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),                 // caller
      meta(a.serviceAgreement, false, false),     // service_agreement
      meta(a.plan, false, true),                  // plan (init)
      meta(a.localDomain, false, false),          // local_domain
      meta(a.distributionDomain, false, true),    // distribution_domain (init)
      meta(SYSTEM_PROGRAM_ID, false, false),
      ...remaining,
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// initialize_root_ip_block(tier: u8, base_ipv4: u32, base_cidr: u8)
// app/ipam/init_root_blocks.rs InitializeRootIpBlock<'info>
// ---------------------------------------------------------------------------
export interface InitializeRootIpBlockAccounts {
  caller: PublicKey
  config: PublicKey
  ipRegistry: PublicKey
  rootIpBlock: PublicKey
  authority: PublicKey
}

export interface InitializeRootIpBlockArgs {
  tier: IpTier
  baseIpv4: number // u32
  baseCidr: number // u8
}

export function buildInitializeRootIpBlock(
  a: InitializeRootIpBlockAccounts,
  args: InitializeRootIpBlockArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.alloc(8 + 1 + 4 + 1)
  IX_DISC.initialize_root_ip_block.copy(data, 0)
  data.writeUInt8(args.tier, 8)
  data.writeUInt32LE(args.baseIpv4, 9)
  data.writeUInt8(args.baseCidr, 13)
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.caller, true, true),                  // caller
      meta(a.config, false, false),                // config
      meta(a.ipRegistry, false, true),             // ip_registry (init_if_needed)
      meta(a.rootIpBlock, false, true),            // root_ip_block (init)
      meta(a.authority, false, false),             // authority (UncheckedAccount)
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
// allocate_ip(tier: u8)
// app/ipam/allocate_ip.rs AllocateIp<'info>
// ---------------------------------------------------------------------------
export interface AllocateIpAccounts {
  authority: PublicKey
  device: PublicKey
  ipRegistry: PublicKey
  rootIpBlock: PublicKey
  ipBlock: PublicKey
  ipLease: PublicKey
}

export interface AllocateIpArgs {
  tier: IpTier
}

export function buildAllocateIp(
  a: AllocateIpAccounts,
  args: AllocateIpArgs,
  programId = DAWN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.alloc(8 + 1)
  IX_DISC.allocate_ip.copy(data, 0)
  data.writeUInt8(args.tier, 8)
  return new TransactionInstruction({
    programId,
    keys: [
      meta(a.authority, true, true),               // authority (signer, mut)
      meta(a.device, false, false),                // device
      meta(a.ipRegistry, false, true),             // ip_registry (mut)
      meta(a.rootIpBlock, false, true),            // root_ip_block (mut)
      meta(a.ipBlock, false, true),                // ip_block (init_if_needed)
      meta(a.ipLease, false, true),                // ip_lease (init)
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data,
  })
}
