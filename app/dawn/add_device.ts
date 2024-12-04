import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { connect, getFlag, getMock, submitTx } from './utils'
import { COORD_DENOMINATOR } from '../utils'

// CONSTANTS
const LATITUDE = new BN(37.164277)
const LONGITUDE = new BN(-121.930924)
const MAC_ADDRESS = [0, 0, 0, 0, 0, 0]

async function main() {
  const longitudeFlag = getFlag('--longitude')
  const latitudeFlag = getFlag('--latitude')

  const longitude = longitudeFlag
    ? new BN(parseFloat(longitudeFlag) * COORD_DENOMINATOR)
    : LONGITUDE
  const latitude = latitudeFlag
    ? new BN(parseFloat(latitudeFlag) * COORD_DENOMINATOR)
    : LATITUDE

  console.log({ latitude, longitude })

  const { wallet, connection, program } = await connect()
  const mock = getMock()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [devicePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device'),
      Buffer.from(wallet.payer.publicKey.toBytes()),
      Buffer.from(mock.deviceModelPda.toBytes()),
      Buffer.from(MAC_ADDRESS),
    ],
    program.programId,
  )

  const [deviceLocationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('device_location'), Buffer.from(devicePda.toBytes())],
    program.programId,
  )

  console.log({ devicePda: devicePda.toBase58() })
  console.log({ deviceLocationPda: deviceLocationPda.toBase58() })
  console.log({ deviceModelPda: mock.deviceModelPda.toBase58() })

  const itx = await program.methods
    .addDevice(latitude, longitude, MAC_ADDRESS)
    .accounts({
      caller: wallet.payer.publicKey,
      device: devicePda,
      deviceModel: mock.deviceModelPda,
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
