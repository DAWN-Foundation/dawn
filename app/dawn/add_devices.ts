import { BN, Wallet } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

import { connect, DeviceGenerator, getFlag, submitTx } from './utils'
import { COORD_DENOMINATOR, deviceTypeSeed, fund } from '../utils'

// CONSTANTS
const MANUFACTURER = 'MikroTik'
const MODEL = 'GG69420'

async function main() {
    const { program, wallet } = await connect()

    const devices = DeviceGenerator.genearate(2, [-121.1153238, 37.3985593, -122.3253238, 37.1615593])

    for (const device of devices) {
        const longitude = new BN(device.coord.at(0)).mul(COORD_DENOMINATOR)
        const latitude = new BN(device.coord.at(1)).mul(COORD_DENOMINATOR)
        
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
            // const txResult = await submitTx(connection, wallet, itx)
            // console.log('Tx submitted', { txResult })
            console.log(`device: ${devices.at(0)} -> OK`)
        } catch (error) {
            console.error(error)
        }
    }

}

main().catch(console.error)
