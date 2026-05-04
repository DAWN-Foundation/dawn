/**
 * Small SF wireless ISP — Day 0 launch.
 *
 * Four actors, six top-level business events, ~22 dawn ticks.
 *
 *   E1  Protocol Genesis            (foundation)         ← runs inside bootProtocol
 *   E2  Network Catalog             (foundation)
 *   E3  IPAM Provisioning           (foundation)
 *   E4  Mission ISP onboarding      (sp_mission)         residential, urban dense
 *   E5  Sunset ISP onboarding       (sp_sunset)          residential, two-tier
 *   E6  Backhaul Bridge onboarding  (sp_backhaul)        wholesale uplink, PtP
 *
 * The scenario exercises both DeviceModels (Router for residential SPs,
 * WirelessRadio for backhaul) and both supported IpTiers (Loopback for
 * device management addresses; PtP /31 for the backhaul uplink).
 */

import { Keypair, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

import { dawnMintPda } from './codec/pda'

import {
  buildAddDevice,
  buildAddDeviceModel,
  buildAddL3Plan,
  buildAddServiceAgreement,
  buildAllocateIp,
  buildInitializeRootIpBlock,
  buildUpdateLocalDomainStatus,
} from './codec/encoders'
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
import { fund, runScenario, send } from './runner'
import { expect } from './expectations'

export const scenario = {
  name: 'small-isp',
  seed: 42,
  expects: [
    // 1. Actor account count: foundation owns 0 LocalDomains, each SP
    //    owns exactly 1 (created by their first add_device).
    expect.actorOwns('sp_mission', 'LocalDomain', { count: 1 }),
    expect.actorOwns('sp_sunset', 'LocalDomain', { count: 1 }),
    expect.actorOwns('sp_backhaul', 'LocalDomain', { count: 1 }),

    // 2. Lease counts per IP tier — Loopback should have one /32 each
    //    for Mission, Sunset, and Backhaul = 3. PtP should have 1 (the
    //    Backhaul uplink).
    expect.totalLeases({ tier: 'Loopback', count: 3 }),
    expect.totalLeases({ tier: 'PtP', count: 1 }),

    // 3. Token balance check: the foundation's DAWN ATA holds the
    //    genesis 1B DAWN supply (×10^6 decimals). The scenario never
    //    transfers DAWN out, so this stays at the initial mint amount.
    //    Implemented via expect.custom because the foundation's ATA is
    //    a runtime-derived address (getAssociatedTokenAddress over the
    //    DAWN mint + foundation wallet).
    expect.custom('foundation holds full DAWN genesis supply', (state) => {
      const foundationPk = new PublicKey(state.metadata().actors['foundation'])
      const [dawnMint] = dawnMintPda()
      const ata = getAssociatedTokenAddressSync(dawnMint, foundationPk)
      const balance = state.tokenBalance(ata)
      const expected = 1_000_000_000n * 1_000_000n
      return balance >= expected
        ? { ok: true }
        : {
            ok: false,
            message: `foundation DAWN balance ${balance} < expected ${expected}`,
            accounts: [ata],
          }
    }),

    // 4. Custom check: Sunset has exactly 2 distinct plans (Basic + Premium).
    expect.custom('sp_sunset has 2 plans', (state) => {
      const meta = state.metadata()
      const sunsetPk = meta.actors['sp_sunset']
      const plans = state
        .byType('Plan')
        .filter((p) => (p.decoded as any).owner.toBase58() === sunsetPk)
      return plans.length === 2
        ? { ok: true }
        : {
            ok: false,
            message: `expected sp_sunset to publish 2 plans, found ${plans.length}`,
          }
    }),

    // 5. Custom check: Mission's LocalDomain ends in Maintenance state
    //    (the maintenance window declared mid-scenario was not closed).
    expect.custom('mission domain ended in Maintenance', (state) => {
      const meta = state.metadata()
      const missionPk = meta.actors['sp_mission']
      const ld = state
        .byType('LocalDomain')
        .find((d) => (d.decoded as any).owner.toBase58() === missionPk)
      if (!ld) return { ok: false, message: 'no LocalDomain owned by sp_mission' }
      const status = (ld.decoded as any).coverageStatus
      return status === 'Maintenance'
        ? { ok: true }
        : { ok: false, message: `expected Maintenance, got ${status}` }
    }),
  ],
  run: async (capture: any, p: any) => {
    await runSmallIspScenario(capture, p)
  },
}

async function runSmallIspScenario(capture: any, p: any) {
  const { payer } = p

  // -----------------------------------------------------------------------
  // E2: Network Catalog
  // -----------------------------------------------------------------------
  const [routerModel] = deviceModelPda(DeviceType.Router, 'MikroTik', 'GG69420')
  const [radioModel] = deviceModelPda(
    DeviceType.WirelessRadio,
    'DAWN',
    'WR-2024',
  )
  const slaThreshold = 99n * 1_000_000n
  const slaPayoutRatio = 100n
  const [serviceAgreement] = serviceAgreementPda(slaThreshold, slaPayoutRatio)

  await capture.event(
    'Network Catalog',
    {
      actor: 'foundation',
      description:
        "After Genesis, the authority publishes the catalog every service " +
        "provider will reference: which device models are recognised on the " +
        "network, and what service-level agreement plans must adhere to. " +
        "Catalogs are append-only — adding a new device model or SLA tier " +
        "later doesn't break existing plans.",
    },
    async () => {
    await capture.event(
      'Publish device models',
      {
        description:
          'Registers the two device models supported in this scenario: a ' +
          'MikroTik GG69420 router (used by residential SPs) and a DAWN ' +
          "WR-2024 wireless radio (used by the wholesale backhaul SP). Each " +
          'model becomes a PDA that any provider can attach a Device account to.',
      },
      async () => {
      await send(
        capture,
        buildAddDeviceModel(
          { caller: payer.publicKey, config: p.config, deviceModel: routerModel },
          { deviceType: DeviceType.Router, manufacturer: 'MikroTik', model: 'GG69420' },
        ),
        [payer],
        'add_device_model:router',
      )
      await send(
        capture,
        buildAddDeviceModel(
          { caller: payer.publicKey, config: p.config, deviceModel: radioModel },
          { deviceType: DeviceType.WirelessRadio, manufacturer: 'DAWN', model: 'WR-2024' },
        ),
        [payer],
        'add_device_model:wireless_radio',
      )
    })
    await capture.event(
      'Publish service tier',
      {
        description:
          'Creates the 99% / 100%-payout ServiceAgreement PDA. Every L3 plan ' +
          'in this scenario will reference this single agreement, which ' +
          'specifies the uptime threshold subscribers expect (99,000,000 ' +
          'with USD.tel decimals) and the payout ratio when SLA is met (100%).',
      },
      async () => {
      await send(
        capture,
        buildAddServiceAgreement(
          { caller: payer.publicKey, config: p.config, serviceAgreement },
          { threshold: slaThreshold, payoutRatio: slaPayoutRatio },
        ),
        [payer],
        'add_service_agreement:99pct',
      )
    })
  })

  // -----------------------------------------------------------------------
  // E3: IPAM Provisioning  (Loopback + PtP)
  // -----------------------------------------------------------------------
  const loopbackTier = IpTier.Loopback
  const loopbackBase = ((100 << 24) | (64 << 16)) >>> 0 // 100.64.0.0
  const ptpTier = IpTier.PtP
  const ptpBase = ((100 << 24) | (96 << 16)) >>> 0 // 100.96.0.0
  const [loopbackRegistry] = ipRegistryPda(loopbackTier)
  const [loopbackRoot] = rootIpBlockPda(loopbackTier, 0)
  const [ptpRegistry] = ipRegistryPda(ptpTier)
  const [ptpRoot] = rootIpBlockPda(ptpTier, 0)
  const [loopbackBlock0] = ipBlockPda(loopbackRoot, 0)
  const [ptpBlock0] = ipBlockPda(ptpRoot, 0)

  await capture.event(
    'IPAM Provisioning',
    {
      actor: 'foundation',
      description:
        'The authority opens the IPv4 address pools providers can draw from. ' +
        'DAWN runs three tiers of leases: Subscriber /32 (end customers), ' +
        'Loopback /32 (device management), and PtP /31 (point-to-point ' +
        'wireless backhaul links). Each tier is anchored by a registry and ' +
        'a root /11 block; child /22 blocks are created lazily on first allocate.',
    },
    async () => {
    await capture.event(
      'Open Loopback /11 tier',
      {
        description:
          'Creates the IpRegistry and first RootIpBlock for the Loopback ' +
          'tier rooted at 100.64.0.0/11. SPs will draw a /32 management IP ' +
          'from this pool whenever they register a Device — the routable ' +
          'address that the device runs its control plane on.',
      },
      async () => {
      await send(
        capture,
        buildInitializeRootIpBlock(
          {
            caller: payer.publicKey,
            config: p.config,
            ipRegistry: loopbackRegistry,
            rootIpBlock: loopbackRoot,
            authority: payer.publicKey,
          },
          { tier: loopbackTier, baseIpv4: loopbackBase, baseCidr: 11 },
        ),
        [payer],
        'initialize_root_ip_block:loopback',
      )
    })
    await capture.event(
      'Open PtP /11 tier',
      {
        description:
          'Creates the IpRegistry and first RootIpBlock for the PtP (point-' +
          "to-point) tier rooted at 100.96.0.0/11. PtP leases are /31 pairs " +
          '— each lease represents one wireless backhaul link between two ' +
          'devices. The wholesale Backhaul Bridge SP later in this scenario ' +
          'claims one of these for its uplink.',
      },
      async () => {
      await send(
        capture,
        buildInitializeRootIpBlock(
          {
            caller: payer.publicKey,
            config: p.config,
            ipRegistry: ptpRegistry,
            rootIpBlock: ptpRoot,
            authority: payer.publicKey,
          },
          { tier: ptpTier, baseIpv4: ptpBase, baseCidr: 11 },
        ),
        [payer],
        'initialize_root_ip_block:ptp',
      )
    })
  })

  // -----------------------------------------------------------------------
  // Helper: residential SP onboarding (used by Mission and Sunset).
  // -----------------------------------------------------------------------
  type ResidentialOpts = {
    actorName: string
    eventName: string
    eventDescription: string
    sp: Keypair
    domainName: string
    deviceName: string
    macAddress: number[]
    latitude: bigint
    longitude: bigint
    height: number
    plans: Array<{ name: string; price: bigint; speed: number; capacity: bigint }>
  }
  async function onboardResidentialSP(o: ResidentialOpts) {
    capture.declareActor(o.actorName, o.sp.publicKey)
    const [localDomain] = localDomainPda(o.sp.publicKey, o.domainName)
    const [device] = devicePda(o.sp.publicKey, routerModel, o.deviceName, o.macAddress)
    const [deviceLoc] = deviceLocationPda(device)
    const [lease] = ipLeasePda(loopbackTier, device)

    await capture.event(
      o.eventName,
      { actor: o.actorName, description: o.eventDescription },
      async () => {
      await capture.event(
        'Acquire SOL',
        {
          description:
            "The protocol authority transfers SOL to the SP's wallet so they " +
            'can pay account-creation rent. In production this is the SP ' +
            'top-up flow — for the test scenario we fund directly from the ' +
            'bankrun default payer.',
        },
        async () => {
        await fund(capture, payer, o.sp.publicKey, 5, `fund:${o.actorName}`)
      })
      await capture.event(
        'Register tower',
        {
          description:
            'The SP creates the Device PDA for their tower. add_device ' +
            'simultaneously creates three accounts in one transaction: the ' +
            'Device itself (with name, MAC, and reference to its DeviceModel), ' +
            'a DeviceLocation with GPS lat/lng/height, and the ' +
            "SP's LocalDomain (init_if_needed — first device for an SP " +
            "creates its local domain).",
        },
        async () => {
        await send(
          capture,
          buildAddDevice(
            {
              caller: o.sp.publicKey,
              deviceModel: routerModel,
              device,
              deviceLocation: deviceLoc,
              localDomain,
            },
            {
              name: o.deviceName,
              height: o.height,
              latitude: o.latitude,
              longitude: o.longitude,
              placement: [0, 0],
              macAddress: o.macAddress,
              localDomainName: o.domainName,
            },
          ),
          [o.sp],
          `add_device:${o.actorName}`,
        )
      })
      await capture.event(
        'Claim management IP',
        {
          description:
            "The authority allocates a Loopback /32 from the IP registry for " +
            "this SP's device. allocate_ip lazily creates an IpBlock under " +
            'the root /11 if needed, then writes an IpLease that ties the ' +
            'address to the device. The first such allocation in the scenario ' +
            'will land at 100.64.0.0/32; subsequent leases bump the unit index.',
        },
        async () => {
        await send(
          capture,
          buildAllocateIp(
            {
              authority: payer.publicKey,
              device,
              ipRegistry: loopbackRegistry,
              rootIpBlock: loopbackRoot,
              ipBlock: loopbackBlock0,
              ipLease: lease,
            },
            { tier: loopbackTier },
          ),
          [payer],
          `allocate_ip:${o.actorName}_loopback`,
        )
      })
      for (const planArgs of o.plans) {
        await capture.event(
          `Publish plan: ${planArgs.name}`,
          {
            description:
              `The SP publishes "${planArgs.name}" — a residential L3 plan at ` +
              `${(Number(planArgs.price) / 1_000_000).toFixed(0)} USD.tel for ` +
              `${planArgs.speed} Mbps and ${planArgs.capacity} MB capacity ` +
              `over a 30-day duration. add_l3_plan creates the Plan PDA plus ` +
              `a DistributionDomain that lets resellers (L2 plans) attach. ` +
              `The plan references the shared ServiceAgreement.`,
          },
          async () => {
          const args = {
            name: planArgs.name,
            price: planArgs.price,
            duration: 30,
            speed: planArgs.speed,
            capacity: planArgs.capacity,
            startAt: null as bigint | null,
          }
          const [plan] = planPda({
            owner: o.sp.publicKey,
            localDomain,
            parentPlan: null,
            name: args.name,
            price: args.price,
            duration: args.duration,
            speed: args.speed,
            capacity: args.capacity,
            startAt: 0n,
            serviceAgreement,
          })
          const [distDomain] = distributionDomainPda(plan, localDomain)
          await send(
            capture,
            buildAddL3Plan(
              {
                caller: o.sp.publicKey,
                serviceAgreement,
                plan,
                localDomain,
                distributionDomain: distDomain,
              },
              args,
            ),
            [o.sp],
            `add_l3_plan:${o.actorName}_${args.name.replace(/\s+/g, '_').toLowerCase()}`,
          )
        })
      }
    })
  }

  // -----------------------------------------------------------------------
  // E4: Mission ISP onboarding (residential, single plan)
  // -----------------------------------------------------------------------
  const spMission = Keypair.generate()
  await onboardResidentialSP({
    actorName: 'sp_mission',
    eventName: 'Mission ISP onboarding',
    eventDescription:
      'A residential ISP based in the Mission District onboards onto DAWN. ' +
      "They acquire SOL from the protocol, register the Mission Tower router " +
      'in their sf-mission local domain, claim a management IP, and publish a ' +
      'single residential plan ("Mission Basic") for end customers.',
    sp: spMission,
    domainName: 'sf-mission',
    deviceName: 'Mission Tower',
    macAddress: [0x00, 0x1d, 0xb1, 0x00, 0x00, 0x01],
    latitude: BigInt(Math.round(37.762611 * 1_000_000)),
    longitude: BigInt(Math.round(-122.418 * 1_000_000)),
    height: 18,
    plans: [
      { name: 'Mission Basic', price: 100_000_000n, speed: 100, capacity: 1000n },
    ],
  })

  // -----------------------------------------------------------------------
  // E4.5: Mission declares a planned maintenance window
  //
  // Demonstrates the BSS↔OSS bridge trigger pattern: the SP mutates
  // their LocalDomain's coverage_status field, which is the canonical
  // signal that off-chain BSS systems (billing pause) and OSS systems
  // (provisioning hold) react to. The new instruction
  // `update_local_domain_status` is what makes this possible — added
  // to the on-chain program specifically to model this trigger.
  // -----------------------------------------------------------------------
  const [missionDomainPda] = localDomainPda(spMission.publicKey, 'sf-mission')
  await capture.event(
    'Mission domain: maintenance window',
    {
      actor: 'sp_mission',
      description:
        'Mission ISP declares a planned maintenance window by flipping ' +
        'their LocalDomain coverage_status from Active (0) to Maintenance (2). ' +
        'This is the BSS↔OSS bridge trigger: the LocalDomain mutation is the ' +
        'canonical on-chain event that off-chain billing systems use to pause ' +
        'metering and that operations systems use to hold device provisioning ' +
        'until the window closes.',
    },
    async () => {
      await send(
        capture,
        buildUpdateLocalDomainStatus(
          {
            caller: spMission.publicKey,
            localDomain: missionDomainPda,
          },
          { newStatus: 2 },
        ),
        [spMission],
        'update_local_domain_status:maintenance',
      )
    },
  )

  // -----------------------------------------------------------------------
  // E5: Sunset ISP onboarding (residential, two-tier offering)
  // -----------------------------------------------------------------------
  const spSunset = Keypair.generate()
  await onboardResidentialSP({
    actorName: 'sp_sunset',
    eventName: 'Sunset ISP onboarding',
    eventDescription:
      'A residential ISP in the outer-Sunset district onboards. Same pattern ' +
      'as Mission (acquire SOL, register a router, claim a management IP), ' +
      'but they publish a two-tier plan offering — "Sunset Basic" at 50 Mbps ' +
      'for $80 and "Sunset Premium" at 250 Mbps for $200 — letting subscribers ' +
      "self-select to their bandwidth need.",
    sp: spSunset,
    domainName: 'sf-sunset',
    deviceName: 'Sunset Tower',
    macAddress: [0x00, 0x1d, 0xb1, 0x00, 0x00, 0x02],
    latitude: BigInt(Math.round(37.755 * 1_000_000)),
    longitude: BigInt(Math.round(-122.493 * 1_000_000)),
    height: 22,
    plans: [
      { name: 'Sunset Basic', price: 80_000_000n, speed: 50, capacity: 500n },
      { name: 'Sunset Premium', price: 200_000_000n, speed: 250, capacity: 5000n },
    ],
  })

  // -----------------------------------------------------------------------
  // E6: Backhaul Bridge onboarding (wholesale uplink, PtP)
  // -----------------------------------------------------------------------
  const spBackhaul = Keypair.generate()
  capture.declareActor('sp_backhaul', spBackhaul.publicKey)
  const backhaulDomainName = 'daly-city-uplink'
  const backhaulDeviceName = 'Daly City Uplink'
  const backhaulMac = [0x00, 0x1d, 0xb1, 0x00, 0x00, 0xa0]
  const [backhaulDomain] = localDomainPda(
    spBackhaul.publicKey,
    backhaulDomainName,
  )
  const [backhaulDevice] = devicePda(
    spBackhaul.publicKey,
    radioModel,
    backhaulDeviceName,
    backhaulMac,
  )
  const [backhaulDeviceLoc] = deviceLocationPda(backhaulDevice)
  const [backhaulLoopbackLease] = ipLeasePda(loopbackTier, backhaulDevice)
  const [backhaulPtpLease] = ipLeasePda(ptpTier, backhaulDevice)

  await capture.event(
    'Backhaul Bridge onboarding',
    {
      actor: 'sp_backhaul',
      description:
        'A wholesale uplink provider onboards. Unlike the residential SPs, ' +
        'they register a WirelessRadio device (DAWN WR-2024) instead of a ' +
        'router, and they claim TWO IP leases: a Loopback /32 for management ' +
        'and a PtP /31 for the backhaul link itself. They do not publish ' +
        'consumer plans — they sell capacity to other SPs (modeled in a ' +
        'future scenario via L2 derivative plans).',
    },
    async () => {
      await capture.event(
        'Acquire SOL',
        {
          description:
            'Authority funds the backhaul SP wallet so it can pay for the ' +
            'Device + DeviceLocation + LocalDomain + IpLease account rent ' +
            'that its onboarding will create.',
        },
        async () => {
        await fund(capture, payer, spBackhaul.publicKey, 5, 'fund:sp_backhaul')
      })
      await capture.event(
        'Register backhaul radio',
        {
          description:
            'Creates the Device PDA for "Daly City Uplink", a WirelessRadio ' +
            'pointed east (90° azimuth) at 35m height. The MAC address is ' +
            'distinct from the residential routers, and the LocalDomain is ' +
            "'daly-city-uplink' — separate from sf-mission and sf-sunset.",
        },
        async () => {
        await send(
          capture,
          buildAddDevice(
            {
              caller: spBackhaul.publicKey,
              deviceModel: radioModel,
              device: backhaulDevice,
              deviceLocation: backhaulDeviceLoc,
              localDomain: backhaulDomain,
            },
            {
              name: backhaulDeviceName,
              height: 35,
              latitude: BigInt(Math.round(37.687923 * 1_000_000)),
              longitude: BigInt(Math.round(-122.470293 * 1_000_000)),
              placement: [9000, 0], // 90 deg azimuth (pointing east)
              macAddress: backhaulMac,
              localDomainName: backhaulDomainName,
            },
          ),
          [spBackhaul],
          'add_device:backhaul',
        )
      })
      await capture.event(
        'Claim management IP',
        {
          description:
            'Authority allocates a Loopback /32 from the same pool as the ' +
            'residential SPs use. The radio gets a routable management ' +
            'address inside the Loopback /11 — third lease drawn from this ' +
            'block in the scenario.',
        },
        async () => {
        await send(
          capture,
          buildAllocateIp(
            {
              authority: payer.publicKey,
              device: backhaulDevice,
              ipRegistry: loopbackRegistry,
              rootIpBlock: loopbackRoot,
              ipBlock: loopbackBlock0,
              ipLease: backhaulLoopbackLease,
            },
            { tier: loopbackTier },
          ),
          [payer],
          'allocate_ip:backhaul_loopback',
        )
      })
      await capture.event(
        'Claim PtP uplink',
        {
          description:
            'Authority allocates a PtP /31 pair — two adjacent IPs that ' +
            'represent the two ends of a wireless backhaul link. This is ' +
            'the only PtP allocation in the scenario, anchoring the wholesale ' +
            "tier's address pool.",
        },
        async () => {
        await send(
          capture,
          buildAllocateIp(
            {
              authority: payer.publicKey,
              device: backhaulDevice,
              ipRegistry: ptpRegistry,
              rootIpBlock: ptpRoot,
              ipBlock: ptpBlock0,
              ipLease: backhaulPtpLease,
            },
            { tier: ptpTier },
          ),
          [payer],
          'allocate_ip:backhaul_ptp',
        )
      })
    },
  )

}

// Standalone-runnable: invoke the runner if this file is executed directly.
if (require.main === module) {
  runScenario(scenario).catch((err) => {
    console.error('scenario threw:', err)
    process.exit(1)
  })
}
