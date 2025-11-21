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
  owner: Keypair,
  model: PublicKey,
  name: string,
  macAddress: MacAddress,
): PublicKey {
  const [devicePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device'),
      Buffer.from(owner.publicKey.toBytes()),
      Buffer.from(model.toBytes()),
      hashStringSeed(name),
      Buffer.from(macAddress),
    ],
    program.programId,
  )

  return devicePda
}

export function getAccessDomainPda(
  program: Program<Dawn>,
  devicePda: PublicKey,
): PublicKey {
  const [accessDomainPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('access_domain'), Buffer.from(devicePda.toBytes())],
    program.programId,
  )

  return accessDomainPda
}

export function getAccessDomainForPlanPda(
  program: Program<Dawn>,
  localDomainPda: PublicKey,
  parentPlanPda: PublicKey,
): PublicKey {
  const [accessDomainPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('access_domain'),
      Buffer.from(localDomainPda.toBytes()),
      Buffer.from(parentPlanPda.toBytes()),
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
