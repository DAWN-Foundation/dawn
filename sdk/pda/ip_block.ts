import { BN, Program } from '@coral-xyz/anchor'
import { Dawn } from '../../target/types/dawn'
import { PublicKey } from '@solana/web3.js'
import { IpV4Bytes, IpV6Bytes, PROGRAM_ID } from '..'

export function getIpLeasePda(
  program: Program<Dawn>,
  devicePda: PublicKey,
  ipPoolPda: PublicKey,
  leaseIpV4: IpV4Bytes,
  leaseIpV4CidrMask: number,
  leaseIpV6: IpV6Bytes,
  leaseIpV6CidrMask: number,
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('ip_lease'),
      Buffer.from(devicePda.toBytes()),
      Buffer.from(ipPoolPda.toBytes()),
      Buffer.from(leaseIpV4),
      Buffer.from([leaseIpV4CidrMask]),
      Buffer.from(leaseIpV6.flatMap((byte) => new BN(byte).toArray('le', 2))),
      Buffer.from([leaseIpV6CidrMask]),
    ],
    program.programId,
  )
}

// New IPAM system PDA functions

export function getRootIpBlockPda(tier: number) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('root_ip_block'),
      Buffer.from([tier]),
    ],
    PROGRAM_ID,
  )
}

export function getIpBlockPda(rootIpBlockPda: PublicKey, blockIndex: number) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('ip_block'),
      Buffer.from(rootIpBlockPda.toBytes()),
      new Uint8Array(new Uint32Array([blockIndex]).buffer),
    ],
    PROGRAM_ID,
  )
}

export function getIpLeasePdaNew(tier: number, devicePda: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('ip_lease'),
      Buffer.from([tier]),
      Buffer.from(devicePda.toBytes()),
    ],
    PROGRAM_ID,
  )
}
