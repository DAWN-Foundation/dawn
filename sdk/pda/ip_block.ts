import { BN, Program } from '@coral-xyz/anchor'
import { Dawn } from '../../target/types/dawn'
import { PublicKey } from '@solana/web3.js'
import { IpV4Bytes, IpV6Bytes } from '..'

export function getIpPoolPda(
  program: Program<Dawn>,
  poolIpV4: IpV4Bytes,
  poolIpV4CidrMask: number,
  poolIpV6: IpV6Bytes,
  poolIpV6CidrMask: number,
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('ip_pool'),
      Buffer.from(poolIpV4),
      Buffer.from([poolIpV4CidrMask]),
      Buffer.from(poolIpV6.flatMap((byte) => new BN(byte).toArray('le', 2))),
      Buffer.from([poolIpV6CidrMask]),
    ],
    program.programId,
  )
}

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
