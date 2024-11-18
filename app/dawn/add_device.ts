import * as anchor from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import { connect, getFlag, submitTx } from './utils'

// ENUMS
type deviceType = anchor.IdlTypes<Dawn>["DeviceType"];

/// Denominator of geo coordinates (Basis Points)
const COORD_DENOMINATOR = 10 ** 10;

// CONSTANTS
const MANUFACTURER = '123 Main St'
const MODEL = "Microtic XXXX"
const LATITUDE = 0.0000000001 * COORD_DENOMINATOR
const LONGITUDE = 0.0000000001 * COORD_DENOMINATOR

async function main() {
  const deviceType: deviceType = getFlag('--type') === "router" ? { router: {} } : { wirelessRadio: {} }
  const manufacturer = getFlag('--manufacturer') || MANUFACTURER
  const model = getFlag('--model') || MODEL
  const latitude = new anchor.BN(parseFloat(getFlag('--latitude')) * COORD_DENOMINATOR || LATITUDE)
  const longitude = new anchor.BN(parseFloat(getFlag('--longitude'))  * COORD_DENOMINATOR || LONGITUDE)

  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [devicePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device'),
      Buffer.from(deviceType.toString()),
      Buffer.from(manufacturer),
      Buffer.from(model),
      Buffer.from(latitude.toArray('le', 8)),
      Buffer.from(longitude.toArray('le', 8)),
    ],
    program.programId,
  )

  console.log({ devicePda: devicePda.toBase58() })

  const itx = await program.methods
    .addDevice(
      deviceType,
      manufacturer,
      model,
      latitude,
      longitude,
    )
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
