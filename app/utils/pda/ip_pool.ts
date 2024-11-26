import { BN, Program } from '@coral-xyz/anchor'
import { Dawn } from '../../../target/types/dawn'
import { PublicKey } from '@solana/web3.js'
import { IpV4Bytes, IpV6Bytes } from '..'

export function getIpLeasePda(
  program: Program<Dawn>,
  devicePda: PublicKey,
  ipPoolPda: PublicKey,
  leaseIpV4: IpV4Bytes,
  leaseIpV4CidrMask: number,
  leaseIpV6: IpV6Bytes,
  leaseIpV6CidrMask: number,
) {
  const leaseIpV6Seed = Buffer.alloc(32)
  leaseIpV6.forEach((hex, index) => {
    // turn u16 hex to u8
    const byteArray = new BN(hex).toArray('le', 2)
    leaseIpV6Seed.writeUInt8(byteArray[0], index * 2)
    leaseIpV6Seed.writeUInt8(byteArray[1], index * 2 + 1)
  })

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('ip_lease'),
      Buffer.from(devicePda.toBytes()),
      Buffer.from(ipPoolPda.toBytes()),
      Buffer.from(leaseIpV4),
      Buffer.from([leaseIpV4CidrMask]),
      leaseIpV6Seed,
      Buffer.from([leaseIpV6CidrMask]),
    ],
    program.programId,
  )
}
