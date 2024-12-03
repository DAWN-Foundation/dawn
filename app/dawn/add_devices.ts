import { BN, Wallet } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

import { connect, DeviceGenerator, getFlag, submitTx } from './utils'
import { COORD_DENOMINATOR, deviceTypeSeed, fund } from '../utils'

// CONSTANTS
const MANUFACTURER = 'MikroTik'
const MODEL = 'GG69420'

async function main() {
    const { program, wallet } = await connect()

    const devices = DeviceGenerator.genearate(1, [-121.1153238, 37.3985593, -122.3253238, 37.1615593])

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

    // for (const device of devices) {
    //     // console.log('base js float: ', device.coord.at(0).toFixed(12), device.coord.at(1).toFixed(12))
    //     // console.log('base js float with denominator mul: ', device.coord.at(0) * COORD_DENOMINATOR, device.coord.at(1) * COORD_DENOMINATOR)

    //     const longitude = new BN(Number(device.coord.at(0).toFixed(12)) * COORD_DENOMINATOR)
    //     const latitude = new BN(Number(device.coord.at(1).toFixed(12)) * COORD_DENOMINATOR)

    //     console.log('converted BN to js number', longitude.toNumber(), latitude.toNumber())
    //     console.log('converted BN to js number with denominator div', longitude.toNumber() / COORD_DENOMINATOR, latitude.toNumber() / COORD_DENOMINATOR)
    // }

    // throw "FOR TEST"

    for (const device of devices) {
        const longitude = new BN(Number(device.coord.at(0).toFixed(12)) * COORD_DENOMINATOR)
        const latitude = new BN(Number(device.coord.at(1).toFixed(12)) * COORD_DENOMINATOR)

        console.log('converted BN to js number', longitude.toNumber(), latitude.toNumber())
        console.log('converted BN to js number with denominator div', longitude.toNumber() / COORD_DENOMINATOR, latitude.toNumber() / COORD_DENOMINATOR)

        const [devicePda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('device'),
                Buffer.from(wallet.payer.publicKey.toBytes()),
                Buffer.from(deviceModelPda.toBytes()),
                Buffer.from(device.mac),
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

        try {
            await program.methods
                .addDevice(latitude, longitude, Array.from(Buffer.from(device.mac)))
                .signers([wallet.payer])
                .accounts({
                    caller: wallet.payer.publicKey,
                    device: devicePda,
                    deviceModel: deviceModelPda,
                    deviceLocation: deviceLocationPda,
                })
                .rpc()

            console.log({ device }, " -> OK")
        } catch (error) {
            console.error(error)
        }
    }

}

main().catch(console.error)
