import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { connect, DeviceGenerator, getFlag, getMock, submitTx } from './utils'
import {
  COORD_DENOMINATOR,
  getAccessDomainPda,
  getDeviceLocationPda,
  getDevicePda,
  getPlanPda,
} from '../utils'

// CONSTANTS
const MANUFACTURER = 'MikroTik'
const MODEL = 'GG69420'

// Plan constants
const MIN_PRICE = 50_000_000 // 50 USDC
const MAX_PRICE = 200_000_000 // 200 USDC
const MIN_DURATION = 7 // 7 days
const MAX_DURATION = 90 // 90 days
const MIN_SPEED = 50 // 50 Mbps
const MAX_SPEED = 1000 // 1000 Mbps
const MIN_CAPACITY = 100 // 100 MB
const MAX_CAPACITY = 10000 // 10000 MB
const MIN_SLA = 1
const MAX_SLA = 3

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
  }
}

async function main() {
  const mock = getMock()
  const { program, wallet, connection } = await connect()

  const deviceCountFlag = getFlag('--count')
  const deviceCount = deviceCountFlag ? parseInt(deviceCountFlag) : 5
  const withPlans = getFlag('--with-plans') !== null

  const devices = DeviceGenerator.genearate(
    deviceCount,
    [-121.115323, 37.3985593, -122.3253238, 37.1615593],
  )

  for (const device of devices) {
    const lngFixed = Number(device.coord.at(0).toFixed(6))
    const latFixed = Number(device.coord.at(1).toFixed(6))

    const longitude = new BN(lngFixed * COORD_DENOMINATOR)
    const latitude = new BN(latFixed * COORD_DENOMINATOR)

    const devicePda = getDevicePda(
      program,
      wallet.payer,
      mock.deviceModelPda,
      mock.deviceMacAddress,
    )
    const accessDomainPda = getAccessDomainPda(program, devicePda)
    const deviceLocationPda = getDeviceLocationPda(program, devicePda)

    try {
      // Add device
      const deviceItx = await program.methods
        .addDevice(
          device.height,
          latitude,
          longitude,
          Array.from(Buffer.from(device.mac)),
        )
        .accounts({
          caller: wallet.publicKey,
          device: devicePda,
          deviceModel: mock.deviceModelPda,
          deviceLocation: deviceLocationPda,
          site: null,
        })
        .signers([wallet.payer])
        .instruction()

      const deviceTxResult = await submitTx(connection, wallet, deviceItx)
      console.log('Device added', { txResult: deviceTxResult, device })

      // Add plans if flag is enabled
      if (withPlans) {
        const plansCount = Math.floor(Math.random() * 3) + 1 // 1-3 plans per device

        for (let i = 0; i < plansCount; i++) {
          const planParams = generateRandomPlanParams()

          const [planPda] = getPlanPda(
            program,
            accessDomainPda,
            devicePda,
            null,
            planParams.price,
            planParams.duration,
            planParams.speed,
            planParams.capacity,
            null,
            mock.serviceAgreementPda,
          )

          const planItx = await program.methods
            .addPlan(
              planParams.price,
              planParams.duration,
              planParams.speed,
              planParams.capacity,
              null,
            )
            .accounts({
              caller: wallet.payer.publicKey,
              device: devicePda,
              plan: planPda,
              parentPlan: null,
              subscription: null,
            } as {})
            .signers([wallet.payer])
            .instruction()

          const planTxResult = await submitTx(connection, wallet, planItx)
          console.log('Plan added', {
            txResult: planTxResult,
            devicePda: devicePda.toBase58(),
            planPda: planPda.toBase58(),
            ...planParams,
          })
        }
      }
    } catch (error) {
      console.error(error)
    }
  }
}

main().catch(console.error)
