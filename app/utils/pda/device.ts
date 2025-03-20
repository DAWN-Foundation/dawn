import { PublicKey, Keypair } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'

import { DeviceType, deviceTypeSeed, MacAddress } from '../helpers'
import { Dawn } from '../../../target/types/dawn'

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
      Buffer.from(manufacturer),
      Buffer.from(model.slice(0, 32)),
    ],
    program.programId,
  )

  return deviceModelPda
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
      Buffer.from(name.slice(0, 32)),
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
