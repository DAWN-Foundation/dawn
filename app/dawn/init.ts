import { PublicKey } from '@solana/web3.js'
import {
  connect,
  getMock,
  submitTx,
  DeviceGenerator,
  getRandomInt,
  IpV4Generator,
  IpV6Generator,
} from './utils'
import { BN } from '@coral-xyz/anchor'
import {
  COORD_DENOMINATOR,
  getIpLeasePda,
  getIpPoolPda,
  getPlanPda,
  IpV4Bytes,
  IpV6Bytes,
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
    sla: new BN(Math.floor(Math.random() * (MAX_SLA - MIN_SLA) + MIN_SLA)),
  }
}

async function main() {
  const mock = getMock()
  const { wallet, connection, program } = await connect()

  try {
    // --------------------------------------------------------------------
    // const poolIpV6: IpV6Bytes = [
    //   +getRandomInt(1, 255).toString(16), +getRandomInt(1, 255).toString(16), 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    //   0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    // ]
    // const poolIpV6CidrMask = 108 // For less ips
    // const ipV6List: IpV6Bytes[] = IpV6Generator.generateIPList(poolIpV6.join(':'), poolIpV6CidrMask)

    // console.log({ ipV6List })

    // throw "Some"

    // --------------------------------------------------------------------
    console.log('Add device model')

    const manufacturer = `${getRandomInt(0, 1000)}_MikroTik`
    const model = `${getRandomInt(0, 1000)}_GG69420`

    const [deviceModelPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('device_model'),
        Buffer.from([0]),
        Buffer.from(manufacturer),
        Buffer.from(model),
      ],
      program.programId,
    )

    console.log({ deviceModelPda: deviceModelPda.toBase58() })

    let itx = await program.methods
      .addDeviceModel({ router: {} }, manufacturer, model)
      .accounts({
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
    console.log('Add devices')

    const devices = DeviceGenerator.genearate(
      5,
      [-121.115323, 37.3985593, -122.3253238, 37.1615593],
    )

    const devicesPda: PublicKey[] = []

    for (const device of devices) {
      const lngFixed = Number(device.coord.at(0).toFixed(6))
      const latFixed = Number(device.coord.at(1).toFixed(6))

      const longitude = new BN(lngFixed * COORD_DENOMINATOR)
      const latitude = new BN(latFixed * COORD_DENOMINATOR)

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from(wallet.publicKey.toBytes()),
          Buffer.from(deviceModelPda.toBytes()),
          Buffer.from(device.mac),
        ],
        program.programId,
      )

      devicesPda.push(devicePda)

      const [deviceLocationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('device_location'), Buffer.from(devicePda.toBytes())],
        program.programId,
      )

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
            deviceModel: deviceModelPda,
            deviceLocation: deviceLocationPda,
          })
          .signers([wallet.payer])
          .instruction()

        await submitTx(connection, wallet, deviceItx, false)
        console.log('Device added', { devicePda: devicePda.toBase58() })

        // Add plans if flag is enabled
        const plansCount = Math.floor(Math.random() * 3) + 1 // 1-3 plans per device

        for (let i = 0; i < plansCount; i++) {
          const planParams = generateRandomPlanParams()

          const [planPda] = getPlanPda(
            program,
            devicePda,
            null,
            planParams.price,
            planParams.duration,
            planParams.speed,
            planParams.capacity,
            planParams.sla,
          )

          const planItx = await program.methods
            .addPlan(
              planParams.price,
              planParams.duration,
              planParams.speed,
              planParams.capacity,
              planParams.sla,
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

          await submitTx(connection, wallet, planItx, false)
          console.log('Plan added', { planPda: planPda.toBase58() })
        }
      } catch (error) {
        console.error(error)
      }
    }

    // --------------------------------------------------------------------
    console.log('Add ip pool')

    // Pool IP V4
    const poolIpV4: IpV4Bytes = [11, 11, getRandomInt(1, 255), 0]
    const poolIpV4CidrMask = 24
    const ipV4List: IpV4Bytes[] = IpV4Generator.generateIPList(
      poolIpV4.join('.'),
      poolIpV4CidrMask,
    )

    // Pool IP V6 (2001:db8::/64 - a documentation prefix)
    const poolIpV6: IpV6Bytes = [
      +getRandomInt(1, 255).toString(16),
      +getRandomInt(1, 255).toString(16),
      0x0000,
      0x0000,
      0x0000,
      0x0000,
      0x0000,
      0x0000,
      0x0000,
      0x0000,
      0x0000,
      0x0000,
      0x0000,
      0x0000,
      0x0000,
      0x0000,
    ]
    const poolIpV6CidrMask = 108 // For less ips
    const ipV6List: IpV6Bytes[] = IpV6Generator.generateIPList(
      poolIpV6.join(':'),
      poolIpV6CidrMask,
    )

    const [ipPoolPda] = getIpPoolPda(
      program,
      poolIpV4,
      poolIpV4CidrMask,
      poolIpV6,
      poolIpV6CidrMask,
    )

    itx = await program.methods
      .addIpPool(poolIpV4, poolIpV4CidrMask, poolIpV6, poolIpV6CidrMask)
      .accounts({
        caller: wallet.publicKey,
        config: mock.configPda,
        ipPool: ipPoolPda,
      })
      .signers([wallet.payer])
      .instruction()

    await submitTx(connection, wallet, itx, false)
    console.log('Ip pool added', { ipPoolPda: ipPoolPda.toBase58() })

    // --------------------------------------------------------------------
    console.log('Lease ip')

    for (let i = 0; i < devicesPda.length; i++) {
      // Lease IP V4
      const leaseIpV4: IpV4Bytes = ipV4List[i]
      const leaseIpV4CidrMask = 32

      // Lease IP V6 (2001:db8::1 - a valid address within the pool)
      const leaseIpV6: IpV6Bytes = ipV6List[i]
      const leaseIpV6CidrMask = 128 // Single address

      const [ipLeasePda] = getIpLeasePda(
        program,
        devicesPda[i],
        ipPoolPda,
        leaseIpV4,
        leaseIpV4CidrMask,
        leaseIpV6,
        leaseIpV6CidrMask,
      )

      await program.methods
        .leaseIp(leaseIpV4, leaseIpV4CidrMask, leaseIpV6, leaseIpV6CidrMask)
        .accounts({
          caller: wallet.publicKey,
          config: mock.configPda,
          device: devicesPda[i],
          ipPool: ipPoolPda,
          ipLease: ipLeasePda,
        })
        .signers([wallet.payer])
        .instruction()

      console.log('Leased ip', { ipLeasePda: ipLeasePda.toBase58() })
    }
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
