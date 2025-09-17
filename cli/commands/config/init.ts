import { Connection, PublicKey, SystemProgram } from '@solana/web3.js'
import {
  connect,
  getMock,
  submitTx,
  DeviceGenerator,
  getRandomInt,
  planNames,
} from '../../shared/cli-utils'
import { BN, Program, Wallet } from '@coral-xyz/anchor'
import {
  COORD_DENOMINATOR,
  getDeviceLocationPda,
  getDeviceModelPda,
  getDevicePda,
  getLocalDomainPda,
  getPlanPda,
  getIpLeasePda,
  getConfigPda,
  getIpRegistryPda,
  getIpBlockPda,
  getRootIpBlockPda,
} from '../../../sdk/utils'
import { Dawn } from '../../../target/types/dawn'

// Plan constants
const MIN_PRICE = 50_000_000 // 50 USDC
const MAX_PRICE = 200_000_000 // 200 USDC
const MIN_DURATION = 7 // 7 days
const MAX_DURATION = 90 // 90 days
const MIN_SPEED = 50 // 50 Mbps
const MAX_SPEED = 1000 // 1000 Mbps
const MIN_CAPACITY = 100 // 100 MB
const MAX_CAPACITY = 10000 // 10000 MB

function generateRandomPlanParams() {
  return {
    price: new BN(
      Math.floor(Math.random() * (MAX_PRICE - MIN_PRICE) + MIN_PRICE),
    ),
    duration: Math.floor(
      Math.random() * (MAX_DURATION - MIN_DURATION) + MIN_DURATION,
    ),
    speed: Math.floor(Math.random() * (MAX_SPEED - MIN_SPEED) + MIN_SPEED),
    capacity: new BN(
      Math.floor(Math.random() * (MAX_CAPACITY - MIN_CAPACITY) + MIN_CAPACITY),
    ),
    name: planNames[Math.floor(Math.random() * planNames.length)],
  }
}

async function ensureRootBlockInitialized(
  program: Program<Dawn>,
  wallet: Wallet,
  connection: Connection,
  tier: number,
  baseIpv4: number,
  baseCidr: number,
) {
  const [configPda] = getConfigPda(program)
  const ipRegistryPda = getIpRegistryPda(tier)

  // If registry exists and has at least one root block, skip
  try {
    const registry = await program.account.ipRegistry.fetch(ipRegistryPda)
    if (registry.rootBlockCount && registry.rootBlockCount > 0) return
  } catch (_) {
    // continue to initialize
  }

  let nextIndex = 0
  try {
    const registry = await program.account.ipRegistry.fetch(ipRegistryPda)
    nextIndex = registry.nextIndex ?? 0
  } catch (_) {
    nextIndex = 0
  }

  const rootIpBlockPda = getRootIpBlockPda(tier, nextIndex)

  const itx = await program.methods
    .initializeRootIpBlock(tier, baseIpv4, baseCidr)
    .accountsStrict({
      caller: wallet.payer.publicKey,
      config: configPda,
      ipRegistry: ipRegistryPda,
      rootIpBlock: rootIpBlockPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  await submitTx(connection, wallet, itx, false)
}

async function main() {
  const mock = getMock()
  const { wallet, connection, program } = await connect()

  try {
    console.log('Add device model')

    const manufacturer = `${getRandomInt(0, 1000)}_MikroTik`
    const model = `${getRandomInt(0, 1000)}_GG69420`

    const deviceModelPda = getDeviceModelPda(program, [0], manufacturer, model)

    console.log({ deviceModelPda: deviceModelPda.toBase58() })

    let itx = await program.methods
      .addDeviceModel({ router: {} }, manufacturer, model)
      .accountsPartial({
        config: mock.configPda,
        caller: wallet.payer.publicKey,
        deviceModel: deviceModelPda,
      })
      .instruction()

    await submitTx(connection, wallet, itx, false)
    console.log('Device model added', {
      deviceModelPda: deviceModelPda.toBase58(),
    })

    // --------------------------------------------------------------------
    try {
      await program.account.serviceAgreement.fetch(mock.serviceAgreementPda)
      console.log('Service agreement already exists')
    } catch (error) {
      console.log('Add service agreement')
      const itx2 = await program.methods
        .addServiceAgreement(mock.slaThreshold, mock.slaPayoutRatio)
        .accountsPartial({
          caller: wallet.publicKey,
          config: mock.configPda,
          serviceAgreement: mock.serviceAgreementPda,
        })
        .signers([wallet.payer])
        .instruction()
      await submitTx(connection, wallet, itx2)
    }

    // --------------------------------------------------------------------
    // Initialize IPAM root blocks (subscriber=0, loopback=1, ptp=2)
    console.log('Initialize IPAM root blocks (if needed)')
    await ensureRootBlockInitialized(
      program,
      wallet,
      connection,
      0,
      0x0a400000,
      14,
    ) // 10.64.0.0/14
    await ensureRootBlockInitialized(
      program,
      wallet,
      connection,
      1,
      0x64400000,
      14,
    ) // 100.64.0.0/14
    await ensureRootBlockInitialized(
      program,
      wallet,
      connection,
      2,
      0x64600000,
      14,
    ) // 100.96.0.0/14

    // --------------------------------------------------------------------
    console.log('Add devices')

    const devices = DeviceGenerator.generate(
      5,
      [-121.115323, 37.3985593, -122.3253238, 37.1615593],
    )

    const devicesPda: PublicKey[] = []

    for (let index = 0; index < devices.length; index++) {
      const device = devices[index]
      const lngFixed = Number(device.coord.at(0).toFixed(6))
      const latFixed = Number(device.coord.at(1).toFixed(6))

      const longitude = new BN(lngFixed * COORD_DENOMINATOR)
      const latitude = new BN(latFixed * COORD_DENOMINATOR)

      const devicePda = getDevicePda(
        program,
        wallet.payer,
        deviceModelPda,
        device.name,
        device.mac,
      )

      devicesPda.push(devicePda)

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)
      const localDomainPda = getLocalDomainPda(
        program,
        wallet.publicKey,
        device.localDomain,
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

      const deviceModelType = await program.account.deviceModel.fetch(
        deviceModelPda,
      )

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

      try {
        // Add device
        const deviceItx = await program.methods
          .addDevice(
            device.name,
            device.height,
            latitude,
            longitude,
            device.placement,
            Array.from(Buffer.from(device.mac)),
            device.localDomain,
          )
          .accountsStrict({
            ...accounts,
            caller: wallet.payer.publicKey,
            device: devicePda,
            deviceModel: deviceModelPda,
            deviceLocation: deviceLocationPda,
            localDomain: localDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .instruction()

        await submitTx(connection, wallet, deviceItx, true, 'confirmed')
        console.log('Device added', { devicePda: devicePda.toBase58() })

        // Add plans if flag is enabled
        const plansCount = Math.floor(Math.random() * 3) + 1 // 1-3 plans per device

        for (let i = 0; i < plansCount; i++) {
          const planParams = generateRandomPlanParams()

          const [planPda] = getPlanPda(
            program,
            localDomainPda,
            null,
            planParams.name,
            planParams.price,
            planParams.duration,
            planParams.speed,
            planParams.capacity,
            null,
            mock.serviceAgreementPda,
          )

          const planItx = await program.methods
            .addL3Plan(
              planParams.name,
              planParams.price,
              planParams.duration,
              planParams.speed,
              planParams.capacity,
              null,
            )
            .accounts({
              caller: wallet.payer.publicKey,
              localDomain: localDomainPda,
              serviceAgreement: mock.serviceAgreementPda,
              plan: planPda,
              parentPlan: null,
              subscription: null,
            } as {})
            .signers([wallet.payer])
            .instruction()

          await submitTx(connection, wallet, planItx, false, 'confirmed')
          console.log('Plan added', { planPda: planPda.toBase58() })
        }
      } catch (error) {
        console.error(error)
      }
    }
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
