// import { connect, getMock, submitTx } from './utils'
// import { getIpPoolPda, IpV4Bytes, IpV6Bytes } from '../utils'

// async function main() {
//   const mock = getMock()
//   const { program, wallet, connection } = await connect()

//   // Pool IP V4
//   const poolIpV4: IpV4Bytes = [11, 11, 11, 0]
//   const poolIpV4CidrMask = 24

//   // Pool IP V6 (2001:db8::/64 - a documentation prefix)
//   const poolIpV6: IpV6Bytes = [
//     0x2001, 0x0db8, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
//     0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
//   ]
//   const poolIpV6CidrMask = 64

//   const [ipPoolPda] = getIpPoolPda(
//     program,
//     poolIpV4,
//     poolIpV4CidrMask,
//     poolIpV6,
//     poolIpV6CidrMask,
//   )

//   console.log({ ipPoolPda: ipPoolPda.toBase58() })

//   try {
//     const itx = await program.methods
//       .addIpPool(poolIpV4, poolIpV4CidrMask, poolIpV6, poolIpV6CidrMask)
//       .accounts({
//         caller: wallet.publicKey,
//         config: mock.configPda,
//         ipPool: ipPoolPda,
//       })
//       .signers([wallet.payer])
//       .instruction()

//     try {
//       const txResult = await submitTx(connection, wallet, itx)
//       console.log('Tx submitted', { txResult })
//     } catch (error) {
//       console.error(error)
//     }
//   } catch (error) {
//     console.error(error)
//   }
// }

// main().catch(console.error)
