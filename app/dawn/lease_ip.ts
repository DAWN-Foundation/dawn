import { connect, getFlag, getMock, submitTx } from './utils'
import {
  getConfigPda,
  getIpLeasePda,
  getIpPoolPda,
  IpV4Bytes,
  IpV6Bytes,
} from '../utils'
import { PublicKey } from '@solana/web3.js'

async function main() {
  const device = getFlag('--device')
  if (!device) throw new Error('--device is required')
  const devicePda = new PublicKey(device)

  const mock = getMock()
  const { program, wallet, connection } = await connect()

  const [configPda] = getConfigPda(program)

  // Pool IP V4
  const poolIpV4: IpV4Bytes = [11, 11, 11, 0]
  const poolIpV4CidrMask = 24

  // Pool IP V6 (2001:db8::/64 - a documentation prefix)
  const poolIpV6: IpV6Bytes = [
    0x2001, 0x0db8, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
  ]
  const poolIpV6CidrMask = 64

  const [ipPoolPda] = getIpPoolPda(
    program,
    poolIpV4,
    poolIpV4CidrMask,
    poolIpV6,
    poolIpV6CidrMask,
  )

  console.log({ ipPoolPda: ipPoolPda.toBase58() })

  // Lease IP V4
  const leaseIpV4: IpV4Bytes = [11, 11, 11, 2]
  const leaseIpV4CidrMask = 32

  // Lease IP V6 (2001:db8::1 - a valid address within the pool)
  const leaseIpV6: IpV6Bytes = [
    0x2001, 0x0db8, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0001,
  ]
  const leaseIpV6CidrMask = 128 // Single address

  const [ipLeasePda] = getIpLeasePda(
    program,
    devicePda,
    ipPoolPda,
    leaseIpV4,
    leaseIpV4CidrMask,
    leaseIpV6,
    leaseIpV6CidrMask,
  )

  try {
    const itx = await program.methods
      .leaseIp(leaseIpV4, leaseIpV4CidrMask, leaseIpV6, leaseIpV6CidrMask)
      .accounts({
        caller: wallet.publicKey,
        config: configPda,
        device: devicePda,
        ipPool: ipPoolPda,
        ipLease: ipLeasePda,
      })
      .signers([mock.serviceProvider])
      .instruction()

    console.log({ ipLeasePda: ipLeasePda.toBase58() })

    try {
      const txResult = await submitTx(connection, wallet, itx)
      console.log('Tx submitted', { txResult })
    } catch (error) {
      console.error(error)
    }
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
