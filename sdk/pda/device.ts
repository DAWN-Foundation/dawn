import { PublicKey, Keypair } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'
import { createHash } from 'crypto'

import { DeviceType, deviceTypeSeed, MacAddress } from '../utils/helpers'
import { Dawn } from '../../target/types/dawn'

export function getDeviceModelPda(
  program: Program<Dawn>,
  deviceType: DeviceType | number[],
  manufacturer: string,
  model: string,
): PublicKey {
  const [deviceModelPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device_model'),
      deviceType instanceof Array
        ? Buffer.from(deviceType)
        : deviceTypeSeed(deviceType),
      hashStringSeed(manufacturer),
      hashStringSeed(model),
    ],
    program.programId,
  )

  return deviceModelPda
}

/**
 * Hash a string seed (trimmed) to match Rust hash_string_seed function
 */
function hashStringSeed(input: string): Buffer {
  const trimmed = input.trim()
  return Buffer.from(createHash('sha256').update(trimmed).digest())
}

export function getDevicePda(
  program: Program<Dawn>,
  owner: Keypair | PublicKey,
  model: PublicKey,
  name: string,
  macAddress: MacAddress,
): PublicKey {
  const ownerPubkey = owner instanceof PublicKey ? owner : owner.publicKey
  const [devicePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device'),
      Buffer.from(ownerPubkey.toBytes()),
      Buffer.from(model.toBytes()),
      hashStringSeed(name),
      Buffer.from(macAddress),
    ],
    program.programId,
  )

  return devicePda
}

/**
 * AccessDomain PDA — keyed on (owner, sha256(name)).
 *
 * Schema migration: prior versions seeded on (device) or (plan,
 * local_domain). The redesign makes AccessDomain a first-class
 * operator-owned identity addressed by the operator's pubkey + a
 * hashed human-readable name (the SSID label).
 */
export function getAccessDomainPda(
  program: Program<Dawn>,
  owner: PublicKey,
  name: string,
): PublicKey {
  const trimmed = name.trim()
  const nameHash = createHash('sha256').update(Buffer.from(trimmed, 'utf8')).digest()
  const [accessDomainPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('access_domain'), owner.toBuffer(), nameHash],
    program.programId,
  )

  return accessDomainPda
}

export function getAccessDomainForPlanPda(
  program: Program<Dawn>,
  localDomainPda: PublicKey,
  planPda: PublicKey,
): PublicKey {
  const [accessDomainPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('access_domain'),
      Buffer.from(planPda.toBytes()),
      Buffer.from(localDomainPda.toBytes()),
    ],
    program.programId,
  )

  return accessDomainPda
}

export function getLocalDomainPda(
  program: Program<Dawn>,
  owner: PublicKey,
  localDomainName: string,
): PublicKey {
  const [localDomainPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('local_domain'),
      Buffer.from(owner.toBytes()),
      hashStringSeed(localDomainName),
    ],
    program.programId,
  )

  return localDomainPda
}

export function getDistributionDomainPda(
  program: Program<Dawn>,
  localDomainPda: PublicKey,
): PublicKey {
  const [distributionDomainPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('distribution_domain'), Buffer.from(localDomainPda.toBytes())],
    program.programId,
  )

  return distributionDomainPda
}

export function getDeviceLocationPda(
  program: Program<Dawn>,
  devicePda: PublicKey,
): PublicKey {
  const [deviceLocationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('device_location'), Buffer.from(devicePda.toBytes())],
    program.programId,
  )

  return deviceLocationPda
}

/**
 * Get the PDA for a plan's distribution domain (L3 plans)
 */
export function getPlanDistributionDomainPda(
  program: Program<Dawn>,
  planPda: PublicKey,
  localDomainPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('distribution_domain'),
      planPda.toBuffer(),
      localDomainPda.toBuffer(),
    ],
    program.programId,
  )
}

/**
 * Get the PDA for a plan's access domain (L2 plans)
 */
export function getPlanAccessDomainPda(
  program: Program<Dawn>,
  planPda: PublicKey,
  localDomainPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('access_domain'),
      planPda.toBuffer(),
      localDomainPda.toBuffer(),
    ],
    program.programId,
  )
}
