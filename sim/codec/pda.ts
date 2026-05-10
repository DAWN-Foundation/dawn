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
 * Used by Device, DeviceModel, LocalDomain, AccessDomain PDA seeds.
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** PDA: ["config"] — protocol config singleton (cold-admin authority). */
export function configPda(programId = DAWN_PROGRAM_ID) {
  return find([Buffer.from('config')], programId)
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
// Access domain
// ---------------------------------------------------------------------------

/**
 * PDA: ["access_domain", owner, hash(name)]
 *
 * AccessDomain is a top-level account keyed by (owner, name).
 */
export function accessDomainPda(
  owner: PublicKey,
  name: string,
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [Buffer.from('access_domain'), owner.toBytes(), hashStringSeed(name)],
    programId,
  )
}

// ---------------------------------------------------------------------------
// Tier-2 domain role grants (DomainAuthority)
// ---------------------------------------------------------------------------

/** Mirror of the on-chain `DomainAuthorityRole` enum. Byte values are
 *  stable — once assigned, never reused for a different variant. */
export enum DomainAuthorityRole {
  Registrar = 0,
  ConfigPlaneManager = 1,
  InfrastructureRegistrar = 2,
  // Future variants: AuthMethodManager, PlanCreator, AdminDeputy
}

/**
 * PDA: ["domain_authority", domain, role_byte, authority]
 *
 * `domain` is the AccessDomain (or DistributionDomain in the future) PDA.
 */
export function domainAuthorityPda(
  args: {
    domain: PublicKey
    role: DomainAuthorityRole
    authority: PublicKey
  },
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [
      Buffer.from('domain_authority'),
      args.domain.toBytes(),
      Buffer.from([args.role]),
      args.authority.toBytes(),
    ],
    programId,
  )
}

// ---------------------------------------------------------------------------
// AMF (auth methods, credentials)
// ---------------------------------------------------------------------------

/**
 * Mirror of the on-chain `AuthMethodType` enum. The numeric value here is
 * what the program writes to disk and what `as_seed()` returns as a single
 * byte for PDA derivation.
 */
export enum AuthMethodType {
  Psk = 0,
  Mpsk = 1,
}

/**
 * PDA: ["auth_method", access_domain, method_type(1B)]
 *
 * One AuthMethod per (AccessDomain, method_type). Params can be updated
 * in place at the same PDA via update_auth_method_params; the PDA
 * itself does not depend on parameter contents.
 */
export function authMethodPda(
  args: {
    accessDomain: PublicKey
    methodType: AuthMethodType
  },
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [
      Buffer.from('auth_method'),
      args.accessDomain.toBytes(),
      Buffer.from([args.methodType]),
    ],
    programId,
  )
}

/**
 * PDA: ["credential", access_domain, auth_method, authority]
 *
 * Identity is (access_domain, auth_method, customer).
 */
export function credentialPda(
  args: {
    accessDomain: PublicKey
    authMethod: PublicKey
    authority: PublicKey // the customer
  },
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [
      Buffer.from('credential'),
      args.accessDomain.toBytes(),
      args.authMethod.toBytes(),
      args.authority.toBytes(),
    ],
    programId,
  )
}

// ---------------------------------------------------------------------------
// Access-domain authenticators (Access Points)
// ---------------------------------------------------------------------------

/**
 * PDA: ["authenticator", access_domain, mac_address]
 *
 * `mac_address` is the stable hardware identifier. The authenticator's
 * `current_pubkey` field is mutable via rotate; the PDA stays put.
 */
export function authenticatorPda(
  args: {
    accessDomain: PublicKey
    macAddress: number[] | Uint8Array | Buffer // 6 bytes
  },
  programId = DAWN_PROGRAM_ID,
) {
  return find(
    [
      Buffer.from('authenticator'),
      args.accessDomain.toBytes(),
      Buffer.from(args.macAddress as any),
    ],
    programId,
  )
}
