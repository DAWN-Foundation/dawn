import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { connect, getFlag, getMock, submitTx } from './utils'
import {
  COORD_DENOMINATOR,
  getDeviceLocationPda,
  getDevicePda,
  MacAddress,
} from '../utils'

// CONSTANTS
const LATITUDE = new BN(37.164277)
const LONGITUDE = new BN(-121.930924)
const HEIGHT = 1
const MAC_ADDRESS: MacAddress = [0, 0, 0, 0, 0, 0]

async function main() {
  const mock = getMock()

  const deviceModelFlag = getFlag('--device-model')
  const longitudeFlag = getFlag('--longitude')
  const latitudeFlag = getFlag('--latitude')
  const heightFlag = getFlag('--height')
  const name = getFlag('--name') || mock.deviceName

  const longitude = longitudeFlag
    ? new BN(parseFloat(longitudeFlag) * COORD_DENOMINATOR)
    : LONGITUDE
  const latitude = latitudeFlag
    ? new BN(parseFloat(latitudeFlag) * COORD_DENOMINATOR)
    : LATITUDE
  const height = heightFlag ? parseInt(heightFlag) : HEIGHT
  const deviceModel = deviceModelFlag
    ? new PublicKey(deviceModelFlag)
    : mock.deviceModelPda

  console.log({ latitude, longitude })

  const { wallet, connection, program } = await connect()

  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const devicePda = getDevicePda(
    program,
    wallet.payer,
    deviceModel,
    name,
    MAC_ADDRESS,
  )

  const deviceLocationPda = getDeviceLocationPda(program, devicePda)

  console.log({ devicePda: devicePda.toBase58() })
  console.log({ deviceLocationPda: deviceLocationPda.toBase58() })
  console.log({ deviceModelPda: deviceModel.toBase58() })

  const itx = await program.methods
    .addDevice(name, height, latitude, longitude, MAC_ADDRESS)
    .accounts({
      caller: wallet.payer.publicKey,
      device: devicePda,
      deviceModel,
      deviceLocation: deviceLocationPda,
      site: null,
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
