import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { connect, getFlag, getMock, submitTx } from './utils'
import {
  COORD_DENOMINATOR,
  getAccessDomainPda,
  getDeviceLocationPda,
  getDevicePda,
  getOrganizationPda,
  MacAddress,
  OrganizationType,
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
  const placementFlag = getFlag('--placement')
  const macAddressFlag = getFlag('--mac-address')

  const placement = placementFlag
    ? placementFlag.split(',').map(Number)
    : mock.devicePlacement

  const macAddress = macAddressFlag
    ? macAddressFlag.split(':').map(segment => parseInt(segment, 16)) as MacAddress
    : MAC_ADDRESS

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

  console.log({ latitude, longitude, placement })

  const { wallet, connection, program } = await connect()

  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const devicePda = getDevicePda(
    program,
    wallet.payer,
    deviceModel,
    name,
    macAddress,
  )

  const organizationPda = getOrganizationPda(
    program,
    wallet.publicKey,
    { endUser: {} } as OrganizationType,
    'end_user_organization',
  )
  const accessDomainPda = getAccessDomainPda(program, devicePda)
  const deviceLocationPda = getDeviceLocationPda(program, devicePda)

  console.log({ devicePda: devicePda.toBase58() })
  console.log({ organizationPda: organizationPda.toBase58() })
  console.log({ deviceLocationPda: deviceLocationPda.toBase58() })
  console.log({ deviceModelPda: deviceModel.toBase58() })

  const itx = await program.methods
    .addDevice(name, height, latitude, longitude, placement, macAddress)
    .accounts({
      caller: wallet.payer.publicKey,
      device: devicePda,
      deviceModel,
      organization: organizationPda,
      accessDomain: accessDomainPda,
      deviceLocation: deviceLocationPda,
      site: null,
    })
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx, false)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
