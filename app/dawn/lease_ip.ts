import { connect, getFlag, getMock, submitTx } from './utils'
import { getIpLeasePda, getIpPoolPda, IpV4Bytes, IpV6Bytes } from '../utils'
import { PublicKey } from '@solana/web3.js'


async function main() {
  const devicePdaRaw = getFlag('--device-pda')

  if (!devicePdaRaw) throw "--device-pda is required"

  const mock = getMock()
  const { program, wallet, connection } = await connect()

  const devicePda = new PublicKey(devicePdaRaw);
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

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
      .leaseIp(
        leaseIpV4,
        leaseIpV4CidrMask,
        leaseIpV6,
        leaseIpV6CidrMask,
      )
      .accounts({
        caller: wallet.publicKey,
        config: configPda,
        device: devicePda,
        ipPool: ipPoolPda,
        ipLease: ipLeasePda,
      })
      .signers([mock.serviceProvider])
      .instruction()

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
