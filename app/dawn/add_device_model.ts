import { PublicKey } from '@solana/web3.js'

import { connect, getFlag, getMock, submitTx } from './utils'

// CONSTANTS
const MANUFACTURER = 'MikroTik'
const MODEL = 'GG69420'

async function main() {
  const manufacturer = getFlag('--manufacturer') || MANUFACTURER
  const model = getFlag('--model') || MODEL

  const { wallet, connection, program } = await connect()
  const mock = getMock()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [deviceModelPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device_model'),
      Buffer.from([0]),
      Buffer.from(manufacturer),
      Buffer.from(model),
    ],
    program.programId,
  )

  console.log({ deviceModelPda: deviceModelPda.toBase58() })

  const itx = await program.methods
    .addDeviceModel({ router: {} }, manufacturer, model)
    .accounts({
      config: mock.configPda,
      caller: wallet.payer.publicKey,
      deviceModel: deviceModelPda,
    })
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
