import { BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'

import { connect, getFlag, getMock, submitTx } from '../../shared/cli-utils'
import {
  COORD_DENOMINATOR,
  getDeviceLocationPda,
  getDevicePda,
  getLocalDomainPda,
  MacAddress,
} from '../../../sdk/utils'

// CONSTANTS
const LATITUDE = new BN(37.164277)
const LONGITUDE = new BN(-121.930924)
const HEIGHT = 1
const MAC_ADDRESS: MacAddress = [0, 0, 0, 0, 0, 0]

async function main() {
  const mock = getMock()

  // Required flag: beneficiary
  const beneficiaryFlag = getFlag('--beneficiary')
  const beneficiary = new PublicKey(beneficiaryFlag)

  const deviceModelFlag = getFlag('--device-model')
  const longitudeFlag = getFlag('--longitude')
  const latitudeFlag = getFlag('--latitude')
  const heightFlag = getFlag('--height')
  const name = getFlag('--name') || mock.deviceName
  const placementFlag = getFlag('--placement')
  const macAddressFlag = getFlag('--mac-address')
  const localDomainName = getFlag('--local-domain') || mock.localDomain

  const placement = placementFlag
    ? placementFlag.split(',').map(Number)
    : mock.devicePlacement

  const macAddress = macAddressFlag
    ? (macAddressFlag
        .split(':')
        .map((segment) => parseInt(segment, 16)) as MacAddress)
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
  console.log({ caller: wallet.payer.publicKey.toBase58() })
  console.log({ beneficiary: beneficiary.toBase58() })

  // Use beneficiary for PDA derivation instead of wallet.payer
  const devicePda = getDevicePda(
    program,
    beneficiary,
    deviceModel,
    name,
    macAddress,
  )

  const deviceLocationPda = getDeviceLocationPda(program, devicePda)
  const localDomainPda = getLocalDomainPda(
    program,
    beneficiary,
    localDomainName,
  )

  console.log({ devicePda: devicePda.toBase58() })
  console.log({ deviceLocationPda: deviceLocationPda.toBase58() })
  console.log({ localDomainPda: localDomainPda.toBase58() })
  console.log({ deviceModelPda: deviceModel.toBase58() })

  const itx = await program.methods
    .addDeviceFor(
      name,
      height,
      latitude,
      longitude,
      placement,
      macAddress,
      localDomainName,
    )
    .accountsStrict({
      caller: wallet.payer.publicKey,
      beneficiary: beneficiary,
      device: devicePda,
      deviceModel,
      deviceLocation: deviceLocationPda,
      localDomain: localDomainPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx, false)
    console.log('Device created successfully for beneficiary!', { txResult })
    console.log('Device PDA:', devicePda.toBase58())
    console.log('Device Owner:', beneficiary.toBase58())
    console.log('Caller (Payer):', wallet.payer.publicKey.toBase58())
    console.log('')
    console.log('📌 Note: IP allocation is now separated from device creation.')
    console.log('To allocate IPs for this device, use:')
    console.log(
      `  - For Loopback IP: npx ts-node cli/commands/ipam/allocate_ip.ts --tier 1 --device ${devicePda.toBase58()}`,
    )
    console.log(
      `  - For PtP IP: npx ts-node cli/commands/ipam/allocate_ip.ts --tier 2 --device ${devicePda.toBase58()}`,
    )
    console.log(
      `  - For Subscriber IP: Use lease_subscription_ip.ts after subscribing to a plan`,
    )
  } catch (error) {
    console.error('Failed to create device for beneficiary:', error)
  }
}

main().catch(console.error)

