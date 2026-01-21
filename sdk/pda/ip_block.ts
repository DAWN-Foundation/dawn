import { BN, Program } from '@coral-xyz/anchor'
import { Dawn } from '../../target/types/dawn'
import { PublicKey } from '@solana/web3.js'
import { IpV4Bytes, IpV6Bytes, PROGRAM_ID } from '..'

export function getIpRegistryPda(tier: number) {
  const [ipRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('ip_registry'), Buffer.from([tier])],
    PROGRAM_ID,
  )
  return ipRegistryPda
}

export function getRootIpBlockPda(tier: number, index: number) {
  const [rootIpBlockPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('root_ip_block'),
      Buffer.from([tier]),
      new Uint8Array(new Uint32Array([index]).buffer),
    ],
    PROGRAM_ID,
  )
  return rootIpBlockPda
}

export function getIpBlockPda(rootIpBlockPda: PublicKey, blockIndex: number) {
  const [ipBlockPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('ip_block'),
      Buffer.from(rootIpBlockPda.toBytes()),
      new Uint8Array(new Uint32Array([blockIndex]).buffer),
    ],
    PROGRAM_ID,
  )
  return ipBlockPda
}

/**
 * Get IP Lease PDA for Loopback/PtP tiers (uses device as seed)
 */
export function getIpLeasePda(tier: number, devicePda: PublicKey) {
  const [ipLeasePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('ip_lease'),
      Buffer.from([tier]),
      Buffer.from(devicePda.toBytes()),
    ],
    PROGRAM_ID,
  )
  return ipLeasePda
}

/**
 * Get IP Lease PDA for Subscriber tier (uses subscription as seed)
 */
export function getSubscriberIpLeasePda(subscriptionPda: PublicKey) {
  const [ipLeasePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('ip_lease'),
      Buffer.from([0]), // Subscriber tier = 0
      Buffer.from(subscriptionPda.toBytes()),
    ],
    PROGRAM_ID,
  )
  return ipLeasePda
}
