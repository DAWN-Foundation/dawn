import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import fs from 'fs'

import { connect, getFlag, submitTx } from '../../shared/cli-utils'
import {
  COORD_DENOMINATOR,
  getDeviceLocationPda,
  getDevicePda,
  getOrganizationPda,
  MacAddress,
  OrganizationType,
} from '../../../sdk/utils'

async function main() {
  const deviceModelFlag = getFlag('--device-model')
  if (!deviceModelFlag) throw new Error('--device-model is required')
  const deviceModel = new PublicKey(deviceModelFlag)

  const devicesFile = fs.readFileSync('devices.csv', 'utf8')
  const devices = devicesFile.split('\n').map((line) => line.split(','))
  console.log({ devices })

  const { wallet, connection, program } = await connect()

  for (const device of devices) {
    const [
      azimuthRaw,
      tiltRaw,
      lattitudeRaw,
      longitudeRaw,
      heightRaw,
      _ip,
      macAddressRaw,
      name,
      localDomain,
    ] = device

    const azimuth = parseInt(azimuthRaw)
    const tilt = parseInt(tiltRaw)
    const placement = [azimuth, tilt]
    const lattitude = new BN(parseFloat(lattitudeRaw) * COORD_DENOMINATOR)
    const longitude = new BN(parseFloat(longitudeRaw) * COORD_DENOMINATOR)
    const height = parseInt(heightRaw)
    const macAddress = macAddressRaw
      .split(':')
      .map((segment) => parseInt(segment, 16)) as MacAddress

    console.log('Adding device', {
      azimuth,
      tilt,
      lattitude,
      longitude,
      height,
      macAddress,
      name,
      localDomain,
    })

    const devicePda = getDevicePda(
      program,
      wallet.payer,
      deviceModel,
      name,
      macAddress,
    )

    // try {
    //   const deviceAccount = await program.account.device.fetch(devicePda)
    // } catch (e) {
    //   console.log('missing device', {
    //     devicePda: devicePda.toBase58(),
    //     macAddress,
    //     name,
    //   })
    // }

    const organizationPda = getOrganizationPda(
      program,
      wallet.publicKey,
      { endUser: {} } as OrganizationType,
      'end_user_organization',
    )
    const deviceLocationPda = getDeviceLocationPda(program, devicePda)

    const itx = await program.methods
      .addDevice(
        name,
        height,
        lattitude,
        longitude,
        placement,
        macAddress,
        localDomain,
      )
      .accountsPartial({
        caller: wallet.payer.publicKey,
        device: devicePda,
        deviceModel,
        organization: organizationPda,
        deviceLocation: deviceLocationPda,
        accessDomain: null,
        site: null,
      })
      .rpc()

    console.log({ itx })

    // try {
    //   const txResult = await submitTx(connection, wallet, itx, false)
    //   console.log('Tx submitted', { txResult })
    // } catch (error) {
    //   console.error(error)
    // }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

main().catch(console.error)
