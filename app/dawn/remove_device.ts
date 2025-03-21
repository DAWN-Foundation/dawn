import { PublicKey } from '@solana/web3.js'

import { connect, getFlag, submitTx } from './utils'
import { getDeviceLocationPda } from '../utils'

async function main() {
  const devicePdaFlag = getFlag('--device')
  const devicePda = new PublicKey(devicePdaFlag)

  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const deviceLocationPda = getDeviceLocationPda(program, devicePda)

  console.log({ devicePda: devicePda.toBase58() })
  console.log({ deviceLocationPda: deviceLocationPda.toBase58() })

  const itx = await program.methods
    .removeDevice()
    .accounts({
      caller: wallet.payer.publicKey,
      device: devicePda,
      deviceLocation: deviceLocationPda,
    })
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx, false)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
