/**
 * Milestones 1, 2, 3 — devices, plans, IPAM.
 *
 * Boots the protocol once, then runs through:
 *   1. add_device_model + add_device  → DeviceModel + Device + DeviceLocation + LocalDomain
 *   2. add_service_agreement + add_l3_plan → ServiceAgreement + Plan + DistributionDomain
 *   3. initialize_root_ip_block + allocate_ip → IpRegistry + RootIpBlock + IpBlock + IpLease
 *
 * Each step encodes the instruction via the codec, sends it through bankrun,
 * decodes the resulting account(s), and asserts state matches expectation.
 */

import { Keypair, PublicKey } from '@solana/web3.js'

import {
  buildAddDevice,
  buildAddDeviceModel,
  buildAddL3Plan,
  buildAddServiceAgreement,
  buildAllocateIp,
  buildInitializeRootIpBlock,
} from './codec/encoders'
import {
  decodeDevice,
  decodeDeviceLocation,
  decodeDeviceModel,
  decodeDistributionDomain,
  decodeIpBlock,
  decodeIpLease,
  decodeIpRegistry,
  decodeLocalDomain,
  decodePlan,
  decodeRootIpBlock,
  decodeServiceAgreement,
  formatIpv4,
} from './codec/decoders'
import {
  DeviceType,
  IpTier,
  deviceLocationPda,
  deviceModelPda,
  devicePda,
  distributionDomainPda,
  ipBlockPda,
  ipLeasePda,
  ipRegistryPda,
  localDomainPda,
  planPda,
  rootIpBlockPda,
  serviceAgreementPda,
} from './codec/pda'
import { check, fund, runScenario, send } from './runner'

export const scenario = {
  name: 'milestones',
  seed: 1,
  expects: [],
  run: async (capture: any, p: any) => {
    await runMilestones(capture, p)
  },
}

async function runMilestones(capture: any, p: any) {
  const { ctx, banks, payer } = p

  // ===========================================================
  // Milestone 1: Devices
  // ===========================================================
  console.log('\n--- milestone 1: devices ---')

  const deviceTypeRouter = DeviceType.Router
  const manufacturer = 'MikroTik'
  const model = 'GG69420'
  const [deviceModel] = deviceModelPda(deviceTypeRouter, manufacturer, model)

  await send(
    capture,
    buildAddDeviceModel(
      { caller: payer.publicKey, config: p.config, deviceModel },
      { deviceType: deviceTypeRouter, manufacturer, model },
    ),
    [payer],
    'add_device_model',
  )

  {
    const acc = await banks.getAccount(deviceModel)
    check('DeviceModel exists', acc != null)
    if (acc) {
      const dm = decodeDeviceModel(Buffer.from(acc.data))
      check('DeviceModel.deviceType == Router', dm.deviceType === 'Router')
      check('DeviceModel.manufacturer round-trips', dm.manufacturer === manufacturer)
      check('DeviceModel.model round-trips', dm.model === model)
    }
  }

  // Service provider keypair — the device owner
  const serviceProvider = Keypair.generate()
  // Fund the service provider so they can pay for `init` accounts. Routes
  // through the Capture wrapper so the system transfer is in the trace.
  await fund(capture, payer, serviceProvider.publicKey, 5, 'fund_service_provider')

  const deviceName = 'Box-1'
  const macAddress = [0xac, 0xb6, 0x7c, 0xf1, 0xeb, 0x31]
  const localDomainName = 'sf-mission'
  const [device] = devicePda(
    serviceProvider.publicKey,
    deviceModel,
    deviceName,
    macAddress,
  )
  const [deviceLocation] = deviceLocationPda(device)
  const [localDomain] = localDomainPda(serviceProvider.publicKey, localDomainName)

  // Coordinates scaled ×1e6 (per existing CLI convention: COORD_DENOMINATOR)
  const latitude = BigInt(Math.round(37.774929 * 1_000_000))
  const longitude = BigInt(Math.round(-122.419418 * 1_000_000))

  await send(
    capture,
    buildAddDevice(
      {
        caller: serviceProvider.publicKey,
        deviceModel,
        device,
        deviceLocation,
        localDomain,
      },
      {
        name: deviceName,
        height: 12,
        latitude,
        longitude,
        placement: [0, 0],
        macAddress,
        localDomainName,
      },
    ),
    [serviceProvider],
    'add_device',
  )

  {
    const dAcc = await banks.getAccount(device)
    check('Device exists', dAcc != null)
    if (dAcc) {
      const d = decodeDevice(Buffer.from(dAcc.data))
      check('Device.owner == serviceProvider', d.owner.equals(serviceProvider.publicKey))
      check('Device.model == deviceModel', d.model.equals(deviceModel))
      check('Device.name round-trips', d.name === deviceName)
      check(
        'Device.mac_address round-trips',
        Buffer.from(macAddress).equals(d.macAddress),
      )
    }

    const lAcc = await banks.getAccount(deviceLocation)
    check('DeviceLocation exists', lAcc != null)
    if (lAcc) {
      const l = decodeDeviceLocation(Buffer.from(lAcc.data))
      check('DeviceLocation.device == device', l.device.equals(device))
      check('DeviceLocation.height == 12', l.height === 12, `${l.height}`)
      check('DeviceLocation.latitude round-trips', l.latitude === latitude)
      check('DeviceLocation.longitude round-trips', l.longitude === longitude)
      check('DeviceLocation.verified == false (not yet)', l.verified === false)
    }

    const ldAcc = await banks.getAccount(localDomain)
    check('LocalDomain exists', ldAcc != null)
    if (ldAcc) {
      const ld = decodeLocalDomain(Buffer.from(ldAcc.data))
      check('LocalDomain.name round-trips', ld.name === localDomainName)
      check('LocalDomain.owner == serviceProvider', ld.owner.equals(serviceProvider.publicKey))
    }
  }

  // ===========================================================
  // Milestone 2: Plans
  // ===========================================================
  console.log('\n--- milestone 2: plans ---')

  // 2a. add_service_agreement (authority = config authority = payer)
  const slaThreshold = 100n * 1_000_000n // USD.tel uses 6 decimals
  const slaPayoutRatio = 100n
  const [serviceAgreement] = serviceAgreementPda(slaThreshold, slaPayoutRatio)

  await send(
    capture,
    buildAddServiceAgreement(
      { caller: payer.publicKey, config: p.config, serviceAgreement },
      { threshold: slaThreshold, payoutRatio: slaPayoutRatio },
    ),
    [payer],
    'add_service_agreement',
  )

  {
    const acc = await banks.getAccount(serviceAgreement)
    check('ServiceAgreement exists', acc != null)
    if (acc) {
      const sa = decodeServiceAgreement(Buffer.from(acc.data))
      check('ServiceAgreement.threshold round-trips', sa.threshold === slaThreshold)
      check('ServiceAgreement.payout_ratio round-trips', sa.payoutRatio === slaPayoutRatio)
    }
  }

  // 2b. add_l3_plan (owner = serviceProvider, against the local_domain we just created)
  const planName = 'Basic Home'
  const planPrice = 100_000_000n // 100 USD.tel (×1e6)
  const planDuration = 30
  const planSpeed = 100
  const planCapacity = 1000n
  const planStartAt = null

  const [plan] = planPda({
    owner: serviceProvider.publicKey,
    localDomain,
    parentPlan: null,
    name: planName,
    price: planPrice,
    duration: planDuration,
    speed: planSpeed,
    capacity: planCapacity,
    startAt: 0n, // start_at.unwrap_or(0) for the seed when None
    serviceAgreement,
  })
  const [distributionDomain] = distributionDomainPda(plan, localDomain)

  await send(
    capture,
    buildAddL3Plan(
      {
        caller: serviceProvider.publicKey,
        serviceAgreement,
        plan,
        localDomain,
        distributionDomain,
      },
      {
        name: planName,
        price: planPrice,
        duration: planDuration,
        speed: planSpeed,
        capacity: planCapacity,
        startAt: planStartAt,
      },
    ),
    [serviceProvider],
    'add_l3_plan',
  )

  {
    const pAcc = await banks.getAccount(plan)
    check('Plan exists', pAcc != null)
    if (pAcc) {
      const pl = decodePlan(Buffer.from(pAcc.data))
      check('Plan.owner == serviceProvider', pl.owner.equals(serviceProvider.publicKey))
      check('Plan.name round-trips', pl.name === planName)
      check('Plan.price round-trips', pl.price === planPrice)
      check('Plan.duration round-trips', pl.duration === planDuration)
      check('Plan.speed round-trips', pl.speed === planSpeed)
      check('Plan.capacity round-trips', pl.capacity === planCapacity)
      check('Plan.start_at == 0', pl.startAt === 0n)
      check('Plan.service_agreement matches', pl.serviceAgreement.equals(serviceAgreement))
      check('Plan.access_domain == None (L3)', pl.accessDomain === null)
      check(
        'Plan.distribution_domain == distributionDomain (L3)',
        pl.distributionDomain != null && pl.distributionDomain.equals(distributionDomain),
      )
      check('Plan.parent_plan == None', pl.parentPlan === null)
      check('Plan.auth_methods is empty', pl.authMethods.length === 0)
    }

    const ddAcc = await banks.getAccount(distributionDomain)
    check('DistributionDomain exists', ddAcc != null)
    if (ddAcc) {
      const dd = decodeDistributionDomain(Buffer.from(ddAcc.data))
      check('DistributionDomain.owner == serviceProvider', dd.owner.equals(serviceProvider.publicKey))
      check('DistributionDomain.local_domain == localDomain', dd.localDomain.equals(localDomain))
    }
  }

  // ===========================================================
  // Milestone 3: IPAM
  // ===========================================================
  console.log('\n--- milestone 3: IPAM ---')

  // 3a. initialize_root_ip_block (Loopback tier: 100.64.0.0/11)
  const tier = IpTier.Loopback
  const baseIpv4 = ((100 << 24) | (64 << 16)) >>> 0 // 100.64.0.0
  const baseCidr = 11
  const rootBlockIndex = 0
  const [ipRegistry] = ipRegistryPda(tier)
  const [rootIpBlock] = rootIpBlockPda(tier, rootBlockIndex)

  // ip_block PDA depends on root_ip_block.first_available_block_idx
  // which is initialized to 0 by the program.
  const [ipBlock] = ipBlockPda(rootIpBlock, 0)

  await send(
    capture,
    buildInitializeRootIpBlock(
      {
        caller: payer.publicKey,
        config: p.config,
        ipRegistry,
        rootIpBlock,
        authority: payer.publicKey, // root block authority same as caller in this test
      },
      { tier, baseIpv4, baseCidr },
    ),
    [payer],
    'initialize_root_ip_block',
  )

  {
    const regAcc = await banks.getAccount(ipRegistry)
    check('IpRegistry exists', regAcc != null)
    if (regAcc) {
      const r = decodeIpRegistry(Buffer.from(regAcc.data))
      check('IpRegistry.tier == Loopback', r.tier === 'Loopback')
      check('IpRegistry.root_block_count == 1', r.rootBlockCount === 1)
      check('IpRegistry.next_index == 1', r.nextIndex === 1)
      check('IpRegistry.authority == payer', r.authority.equals(payer.publicKey))
    }

    const rbAcc = await banks.getAccount(rootIpBlock)
    check('RootIpBlock exists', rbAcc != null)
    if (rbAcc) {
      const rb = decodeRootIpBlock(Buffer.from(rbAcc.data))
      check('RootIpBlock.tier == Loopback', rb.tier === 'Loopback')
      check('RootIpBlock.index == 0', rb.index === 0)
      check('RootIpBlock.base_ipv4 round-trips', rb.baseIpv4 === baseIpv4)
      check('RootIpBlock.base_cidr round-trips', rb.baseCidr === baseCidr)
      check('RootIpBlock.block_cidr == 22', rb.blockCidr === 22)
      check('RootIpBlock.first_available_block_idx == 0', rb.firstAvailableBlockIdx === 0)
    }
  }

  // 3b. allocate_ip (allocates a Loopback /32 lease to the device)
  const [ipLease] = ipLeasePda(tier, device)

  await send(
    capture,
    buildAllocateIp(
      {
        authority: payer.publicKey, // root block authority
        device,
        ipRegistry,
        rootIpBlock,
        ipBlock,
        ipLease,
      },
      { tier },
    ),
    [payer],
    'allocate_ip',
  )

  {
    const blockAcc = await banks.getAccount(ipBlock)
    check('IpBlock exists', blockAcc != null)
    if (blockAcc) {
      const b = decodeIpBlock(Buffer.from(blockAcc.data))
      check('IpBlock.tier == Loopback', b.tier === 'Loopback')
      check('IpBlock.unit_capacity == 1024', b.unitCapacity === 1024)
      check(
        'IpBlock.free_units == 1023 (one allocated)',
        b.freeUnits === 1023,
        `${b.freeUnits}`,
      )
    }

    const leaseAcc = await banks.getAccount(ipLease)
    check('IpLease exists', leaseAcc != null)
    if (leaseAcc) {
      const l = decodeIpLease(Buffer.from(leaseAcc.data))
      check('IpLease.tier == Loopback', l.tier === 'Loopback')
      check('IpLease.cidr == 32', l.ipv4CidrMask === 32)
      check('IpLease.device == device', l.device != null && l.device.equals(device))
      check('IpLease.unit_index == 0', l.unitIndex === 0)
      // First allocated /32 in 100.64.0.0/22 should be 100.64.0.0
      check(
        'IpLease.ipv4 == 100.64.0.0',
        formatIpv4(l.ipv4) === '100.64.0.0',
        formatIpv4(l.ipv4),
      )
    }
  }

}

if (require.main === module) {
  runScenario(scenario).catch((err) => {
    console.error('milestones threw:', err)
    process.exit(1)
  })
}
