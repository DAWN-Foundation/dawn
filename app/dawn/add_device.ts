import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { connect, getFlag, submitTx } from './utils'
import { COORD_DENOMINATOR } from '../utils'

// CONSTANTS
const MANUFACTURER = 'MikroTik'
const MODEL = 'GG69420'
const LATITUDE = new BN(0.0000000001).mul(COORD_DENOMINATOR)
const LONGITUDE = new BN(0.0000000001).mul(COORD_DENOMINATOR)

async function main() {
  const manufacturer = getFlag('--manufacturer') || MANUFACTURER
  const model = getFlag('--model') || MODEL
  const latitude =
    new BN(parseFloat(getFlag('--latitude'))).mul(COORD_DENOMINATOR) || LATITUDE
  const longitude =
    new BN(parseFloat(getFlag('--longitude'))).mul(COORD_DENOMINATOR) ||
    LONGITUDE

  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [devicePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device'),
      Buffer.from(manufacturer),
      Buffer.from(model),
      Buffer.from(latitude.toArray('le', 8)),
      Buffer.from(longitude.toArray('le', 8)),
    ],
    program.programId,
  )

  console.log({ devicePda: devicePda.toBase58() })

  const itx = await program.methods
    .addDevice(latitude, longitude)
    .accounts({
      caller: wallet.payer.publicKey,
      device: devicePda,
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
