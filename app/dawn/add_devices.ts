import { BN, Wallet } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

import { connect, DeviceGenerator, getFlag, getMock, submitTx } from './utils'
import { COORD_DENOMINATOR, deviceTypeSeed, fund } from '../utils'

// CONSTANTS
const MANUFACTURER = 'MikroTik'
const MODEL = 'GG69420'

async function main() {
  const mock = getMock()
  const { program, wallet, connection } = await connect()

  const devices = DeviceGenerator.genearate(
    20,
    [-121.115323, 37.3985593, -122.3253238, 37.1615593],
  )

  for (const device of devices) {
    const lngFixed = Number(device.coord.at(0).toFixed(6))
    const latFixed = Number(device.coord.at(1).toFixed(6))

    console.log('lngFixed', lngFixed)
    console.log('latFixed', latFixed)

    const longitude = new BN(lngFixed * COORD_DENOMINATOR)
    const latitude = new BN(latFixed * COORD_DENOMINATOR)

    console.log(
      'converted BN to js number',
      longitude.toString(),
      latitude.toString(),
    )

    const lngFloat = parseFloat(longitude.toString()) / COORD_DENOMINATOR
    const latFloat = parseFloat(latitude.toString()) / COORD_DENOMINATOR

    console.log('Back to JS float', lngFloat.toFixed(6), latFloat.toFixed(6))

    const [devicePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('device'),
        Buffer.from(wallet.publicKey.toBytes()),
        Buffer.from(mock.deviceModelPda.toBytes()),
        Buffer.from(device.mac),
      ],
      program.programId,
    )

    const [deviceLocationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('device_location'), Buffer.from(devicePda.toBytes())],
      program.programId,
    )

    try {
      const itx = await program.methods
        .addDevice(latitude, longitude, Array.from(Buffer.from(device.mac)))
        .accounts({
          caller: wallet.publicKey,
          device: devicePda,
          deviceModel: mock.deviceModelPda,
          deviceLocation: deviceLocationPda,
        })
        .signers([wallet.payer])
        .instruction()

      try {
        const txResult = await submitTx(connection, wallet, itx)
        console.log('Tx submitted', { txResult, device })
      } catch (error) {
        console.error(error)
      }
    } catch (error) {
      console.error(error)
    }
  }
}

main().catch(console.error)
