import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { connect, DeviceGenerator, getFlag, submitTx } from './utils'
import { COORD_DENOMINATOR, deviceTypeSeed } from '../utils'

// CONSTANTS
const MANUFACTURER = 'MikroTik'
const MODEL = 'GG69420'
const LATITUDE = new BN(37.16427727029177).mul(COORD_DENOMINATOR)
const LONGITUDE = new BN(-121.93092442368452).mul(COORD_DENOMINATOR)

async function main() {
  const latitude =
    new BN(parseFloat(getFlag('--latitude'))).mul(COORD_DENOMINATOR) || LATITUDE
  const longitude =
    new BN(parseFloat(getFlag('--longitude'))).mul(COORD_DENOMINATOR) ||
    LONGITUDE

  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [deviceModelPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device_model'),
      Buffer.from([0]),
      Buffer.from(MANUFACTURER),
      Buffer.from(MODEL),
    ],
    program.programId,
  )

  const [devicePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device'),
      Buffer.from(wallet.payer.publicKey.toBytes()),
      Buffer.from(deviceModelPda.toBytes()),
    ],
    program.programId,
  )

  const [deviceLocationPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device_location'),
      Buffer.from(devicePda.toBytes()),
    ],
    program.programId,
  )

  console.log({ devicePda: devicePda.toBase58() })
  console.log({ deviceLocationPda: deviceLocationPda.toBase58() })
  console.log({ deviceModelPda: deviceModelPda.toBase58() })

  const itx = await program.methods
    .addDevice(LATITUDE, LONGITUDE)
    .accounts({
      caller: wallet.payer.publicKey,
      device: devicePda,
      deviceModel: deviceModelPda,
      deviceLocation: deviceLocationPda,
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
