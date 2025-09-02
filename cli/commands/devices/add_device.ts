import { BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'

import { connect, getFlag, getMock, submitTx } from '../../shared/cli-utils'
import {
  COORD_DENOMINATOR,
  getIpLeasePda,
  getIpRegistryPda,
  getIpBlockPda,
  getRootIpBlockPda,
  getDeviceLocationPda,
  getDevicePda,
  getLocalDomainPda,
  getOrganizationPda,
  MacAddress,
  OrganizationType,
} from '../../../sdk/utils'

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
  const deviceLocationPda = getDeviceLocationPda(program, devicePda)
  const localDomainPda = getLocalDomainPda(
    program,
    wallet.payer.publicKey,
    localDomainName,
  )
  const loopbackIpRegistryPda = getIpRegistryPda(1)
  const rootLoopbackIpBlockPda = getRootIpBlockPda(1, 0)
  const loopbackIpBlockPda = getIpBlockPda(rootLoopbackIpBlockPda, 0)
  const loopbackIpLeasePda = getIpLeasePda(1, devicePda)

  const accounts = {
    loopbackIpRegistry: loopbackIpRegistryPda,
    rootLoopbackIpBlock: rootLoopbackIpBlockPda,
    loopbackIpBlock: loopbackIpBlockPda,
    loopbackIpLease: loopbackIpLeasePda,
    ptpIpRegistry: null,
    rootPtpIpBlock: null,
    ptpIpBlock: null,
    ptpIpLease: null,
  }

  const deviceModelType = await program.account.deviceModel.fetch(deviceModel)

  if ('wirelessRadio' in deviceModelType.deviceType) {
    const ptpIpRegistryPda = getIpRegistryPda(2)
    const rootPtpIpBlockPda = getRootIpBlockPda(2, 0)
    const ptpIpBlockPda = getIpBlockPda(rootPtpIpBlockPda, 0)
    const ptpIpLeasePda = getIpLeasePda(2, devicePda)

    accounts.ptpIpRegistry = ptpIpRegistryPda
    accounts.rootPtpIpBlock = rootPtpIpBlockPda
    accounts.ptpIpBlock = ptpIpBlockPda
    accounts.ptpIpLease = ptpIpLeasePda
  }

  console.log({ devicePda: devicePda.toBase58() })
  console.log({ organizationPda: organizationPda.toBase58() })
  console.log({ deviceLocationPda: deviceLocationPda.toBase58() })
  console.log({ localDomainPda: localDomainPda.toBase58() })
  console.log({ deviceModelPda: deviceModel.toBase58() })

  const itx = await program.methods
    .addDevice(
      name,
      height,
      latitude,
      longitude,
      placement,
      macAddress,
      localDomainName,
    )
    .accountsStrict({
      ...accounts,
      caller: wallet.payer.publicKey,
      device: devicePda,
      deviceModel,
      organization: organizationPda,
      deviceLocation: deviceLocationPda,
      site: null,
      localDomain: localDomainPda,
      systemProgram: SystemProgram.programId,
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
