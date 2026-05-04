import { createHash } from 'crypto'

import { PublicKey } from '@solana/web3.js'

import { DAWN_PROGRAM_ID } from './program'

/**
 * PDA derivation helpers. Seeds mirror the `seeds = [...]` clauses
 * in the program's #[derive(Accounts)] structs.
 *
 * All helpers take an explicit programId so the same code works against
 * the localnet ID, the devnet ID, or any other test deployment.
 */

function find(seeds: (Buffer | Uint8Array)[], programId = DAWN_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(seeds, programId)
}

/**
 * Mirror of utils::hash_string_seed in the Rust source: trim, then
 * sha256 (called `solana_program::hash::hash`), returning 32 bytes.
 * Used by Device, DeviceModel, LocalDomain, Plan PDA seeds.
 */
export function hashStringSeed(input: string): Buffer {
  const trimmed = input.trim()
  return createHash('sha256').update(Buffer.from(trimmed, 'utf8')).digest()
}

/**
 * Mirror of utils::optional_pubkey_seed: 32 bytes of zero for None,
 * the raw pubkey bytes for Some.
 */
export function optionalPubkeySeed(pk: PublicKey | null): Buffer {
  return pk ? Buffer.from(pk.toBytes()) : Buffer.alloc(32, 0)
}

const u16le = (n: number) => {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n, 0)
  return b
}
const u32le = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n, 0)
  return b
}
const u64le = (n: bigint) => {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(n, 0)
  return b
}
const i64le = (n: bigint) => {
  const b = Buffer.alloc(8)
  b.writeBigInt64LE(n, 0)
  return b
}

// ---------------------------------------------------------------------------
// Token / config bootstrap
// ---------------------------------------------------------------------------

/** PDA: ["token"] — owns the DAWN mint. */
export function tokenConfigPda(programId = DAWN_PROGRAM_ID) {
  return find([Buffer.from('token')], programId)
}

/** PDA: ["dawn"] — the DAWN SPL mint itself. */
export function dawnMintPda(programId = DAWN_PROGRAM_ID) {
  return find([Buffer.from('dawn')], programId)
}

/** PDA: ["config"] — protocol config singleton. */
export function configPda(programId = DAWN_PROGRAM_ID) {
  return find([Buffer.from('config')], programId)
}

/** PDA: ["fee_pool_dawn_account"] — accumulates all DAWN fees. */
export function feePoolDawnAccountPda(programId = DAWN_PROGRAM_ID) {
  return find([Buffer.from('fee_pool_dawn_account')], programId)
}

/** PDA: ["dao_dawn_account"] — DAO-share fee pool. */
export function daoDawnAccountPda(programId = DAWN_PROGRAM_ID) {
  return find([Buffer.from('dao_dawn_account')], programId)
}

/** PDA: ["validator_dawn_account"] — validator-share fee pool. */
export function validatorDawnAccountPda(programId = DAWN_PROGRAM_ID) {
  return find([Buffer.from('validator_dawn_account')], programId)
}

/** PDA: ["medallion_dawn_account"] — medallion-share fee pool. */
export function medallionDawnAccountPda(programId = DAWN_PROGRAM_ID) {
  return find([Buffer.from('medallion_dawn_account')], programId)
}

// ---------------------------------------------------------------------------
// Devices, models, local domains
// ---------------------------------------------------------------------------

/** DeviceType enum mirror — used both in args and PDA seeds. */
export enum DeviceType {
  Router = 0,
  WirelessRadio = 1,
}

/** PDA: ["device_model", device_type, sha256(mfg.trim()), sha256(model.trim())] */
export function deviceModelPda(
  deviceType: DeviceType,
  manufacturer: string,
  model: string,
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [
      Buffer.from('device_model'),
      Buffer.from([deviceType]),
      hashStringSeed(manufacturer),
      hashStringSeed(model),
    ],
    programId,
  )
}

/** PDA: ["device", owner, model_pda, sha256(name.trim()), mac_address] */
export function devicePda(
  owner: PublicKey,
  deviceModel: PublicKey,
  name: string,
  macAddress: number[] | Uint8Array,
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [
      Buffer.from('device'),
      owner.toBytes(),
      deviceModel.toBytes(),
      hashStringSeed(name),
      Buffer.from(macAddress as any),
    ],
    programId,
  )
}

/** PDA: ["device_location", device] */
export function deviceLocationPda(device: PublicKey, programId = DAWN_PROGRAM_ID) {
  return find([Buffer.from('device_location'), device.toBytes()], programId)
}

/** PDA: ["local_domain", owner, sha256(name.trim())] */
export function localDomainPda(
  owner: PublicKey,
  name: string,
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [Buffer.from('local_domain'), owner.toBytes(), hashStringSeed(name)],
    programId,
  )
}

// ---------------------------------------------------------------------------
// Service agreements + plans + domains
// ---------------------------------------------------------------------------

/** PDA: ["service_agreement", threshold(u64 LE), payout_ratio(u64 LE)] */
export function serviceAgreementPda(
  threshold: bigint,
  payoutRatio: bigint,
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [Buffer.from('service_agreement'), u64le(threshold), u64le(payoutRatio)],
    programId,
  )
}

/**
 * PDA for an L3 plan. Seeds:
 *   ["plan", owner, local_domain, optional_pubkey_seed(parent_plan),
 *    sha256(name.trim()), price(u64), duration(u16), speed(u32),
 *    capacity(u64), start_at(i64), service_agreement]
 *
 * For L3 plans, parent_plan is None → 32 zero bytes for that seed.
 */
export function planPda(
  args: {
    owner: PublicKey
    localDomain: PublicKey
    parentPlan: PublicKey | null
    name: string
    price: bigint
    duration: number
    speed: number
    capacity: bigint
    startAt: bigint
    serviceAgreement: PublicKey
  },
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [
      Buffer.from('plan'),
      args.owner.toBytes(),
      args.localDomain.toBytes(),
      optionalPubkeySeed(args.parentPlan),
      hashStringSeed(args.name),
      u64le(args.price),
      u16le(args.duration),
      u32le(args.speed),
      u64le(args.capacity),
      i64le(args.startAt),
      args.serviceAgreement.toBytes(),
    ],
    programId,
  )
}

/** PDA: ["distribution_domain", plan, local_domain] */
export function distributionDomainPda(
  plan: PublicKey,
  localDomain: PublicKey,
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [Buffer.from('distribution_domain'), plan.toBytes(), localDomain.toBytes()],
    programId,
  )
}

// ---------------------------------------------------------------------------
// IPAM
// ---------------------------------------------------------------------------

/** IpTier enum mirror — used in args and PDA seeds. */
export enum IpTier {
  Subscriber = 0,
  Loopback = 1,
  PtP = 2,
}

/** PDA: ["ip_registry", tier(u8)] */
export function ipRegistryPda(tier: IpTier, programId = DAWN_PROGRAM_ID) {
  return find([Buffer.from('ip_registry'), Buffer.from([tier])], programId)
}

/** PDA: ["root_ip_block", tier(u8), index(u32 LE)] */
export function rootIpBlockPda(
  tier: IpTier,
  index: number,
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [Buffer.from('root_ip_block'), Buffer.from([tier]), u32le(index)],
    programId,
  )
}

/** PDA: ["ip_block", root_ip_block, block_idx(u32 LE)] */
export function ipBlockPda(
  rootIpBlock: PublicKey,
  blockIdx: number,
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [Buffer.from('ip_block'), rootIpBlock.toBytes(), u32le(blockIdx)],
    programId,
  )
}

/** PDA: ["ip_lease", tier(u8), seed_key (device or subscription)] */
export function ipLeasePda(
  tier: IpTier,
  seedKey: PublicKey,
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [Buffer.from('ip_lease'), Buffer.from([tier]), seedKey.toBytes()],
    programId,
  )
}
