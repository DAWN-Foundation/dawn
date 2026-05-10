#!/usr/bin/env -S node_modules/.bin/ts-node --transpile-only

/**
 * Dense airport-themed MPSK scenario for SoT-bridge integration testing
 * (post-fix verification round).
 *
 * Same structural shape as devnet-mpsk-mall-scenario.ts so the bridge
 * gets equivalent event-class coverage, but with entirely new data:
 *   - new SSIDs (TerminalA / TerminalB instead of MallNorth/MallSouth)
 *   - new customer PSKs across the same shape spectrum (short / typical
 *     / unicode-CJK / unicode-Latin / special-chars / emoji / long)
 *   - fresh ephemeral keypairs for everything per run
 *
 * Bug-fix verification points:
 *   1. Customer PSK rotation (TerminalA/cust-003): revoke + re-register
 *      at same PDA. After fix the bridge should show this credential as
 *      ACTIVE with the rotated PSK, not REVOKED.
 *   2. AuthMethodParamsUpdated handling: bridge re-fetches AuthMethod
 *      and decodes the new params (ssid_6_ghz_len == 0 post-update).
 *   3. Multi-AD partitioning still clean across two buildings.
 *   4. Triple registrar rotation in TerminalA (v1→v2→v3→v4) tracked.
 *
 * Same expected event-counts as the mall scenario: ~33 program txs, ~39 events.
 */

import { randomBytes } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'

import {
  buildAddAccessDomain,
  buildAddDeviceFor,
  buildAddDeviceModel,
  buildGrantDomainAuthorityForAccessDomain,
  buildRegisterAuthMethod,
  buildRegisterCredentialFor,
  buildRevokeCredential,
  buildRevokeDomainAuthorityForAccessDomain,
  buildUpdateAuthMethodParams,
} from '../sim/codec/encoders'
import {
  accessDomainPda,
  authMethodPda,
  AuthMethodType,
  configPda,
  credentialPda,
  deviceLocationPda,
  deviceModelPda,
  devicePda,
  DeviceType,
  domainAuthorityPda,
  DomainAuthorityRole,
  localDomainPda,
} from '../sim/codec/pda'
import {
  defaultPskParams,
  encodePSKMethodParams,
  PSKMethodParams,
  WiFiEncryption,
  WiFiSecurityStandard,
} from '../sim/codec/psk'
import { framePsk, sealForRecipient } from '../sim/codec/sealing'

// ---------------------------------------------------------------------------
// Identity / config
// ---------------------------------------------------------------------------
const DEVNET_PROGRAM_ID = new PublicKey(
  'rHSumT63fgwAsHhKbR39AijjY28H99VuvM8xNaNehkj',
)
const BRIDGE_PUBKEY = new PublicKey(
  '2tXxypDNQbJU6wqxodttDbvSZN2Nebuzypps1huH3ZsF',
)
const RPC = process.env.RPC ?? 'https://api.devnet.solana.com'
const KEYPAIR_PATH =
  process.env.DEPLOYER_KEYPAIR ?? path.join(os.homedir(), '.config/solana/id.json')

const SUFFIX = Math.floor(Date.now() / 1000) % 1_000_000

// ---------------------------------------------------------------------------
// Buildings — fresh airport-themed PSKs across the shape spectrum
// ---------------------------------------------------------------------------
interface Building {
  label: string
  ssid: string
  aaaDeviceName: string
  aaaLocalDomainName: string
  aaaMac: number[]
  customers: CustomerSignup[]
  pdas?: BuildingPdas
}

interface CustomerSignup {
  id: string
  psk: string
  vlanId: number | null
  qosTag: number | null
}

interface BuildingPdas {
  aaaDevice: PublicKey
  aaaDeviceLoc: PublicKey
  aaaLocalDomain: PublicKey
  accessDomain: PublicKey
  authMethod: PublicKey
}

const buildings: Building[] = [
  {
    label: 'TerminalA',
    ssid: `TerminalA-${SUFFIX}`,
    aaaDeviceName: `aaa-term-a-${SUFFIX}`,
    aaaLocalDomainName: `term-a-mgmt-${SUFFIX}`,
    aaaMac: [0x02, 0xa1, 0x70, 0x00, 0x00, SUFFIX & 0xff],
    customers: [
      { id: 'cust-001', psk: 'term-a-flight-1601',                         vlanId: 100, qosTag: 46 }, // 18B typical
      { id: 'cust-002', psk: '8888',                                       vlanId: null, qosTag: null }, // 4B short, will be revoked
      { id: 'cust-003', psk: 'term-a-rotates-monthly',                    vlanId: 110, qosTag: 26 }, // will be rotated
      { id: 'cust-004', psk: '北京-airport-vip',                            vlanId: 120, qosTag: 18 }, // CJK 3-byte unicode
      { id: 'cust-005', psk: 'T0p$ecret_Wifi&Co*',                         vlanId: 130, qosTag: 0 },  // special chars
      { id: 'cust-006', psk: 'this-is-the-longest-psk-we-can-fit-here-yes-yes', vlanId: 140, qosTag: 8 }, // 47B near-max
    ],
  },
  {
    label: 'TerminalB',
    ssid: `TerminalB-${SUFFIX}`,
    aaaDeviceName: `aaa-term-b-${SUFFIX}`,
    aaaLocalDomainName: `term-b-mgmt-${SUFFIX}`,
    aaaMac: [0x02, 0xa1, 0x71, 0x00, 0x00, SUFFIX & 0xff],
    customers: [
      { id: 'cust-001', psk: 'term-b-flight-2502',                         vlanId: 200, qosTag: 46 },
      { id: 'cust-002', psk: '0000',                                       vlanId: null, qosTag: null }, // 4B, will be revoked
      { id: 'cust-003', psk: 'term-b-vip-lounge',                          vlanId: 210, qosTag: 26 },
      { id: 'cust-004', psk: 'ñoño-saludos-amigo',                         vlanId: 220, qosTag: 18 }, // Spanish unicode
      { id: 'cust-005', psk: 'aero-lounge-94',                             vlanId: 230, qosTag: 0 },
      { id: 'cust-006', psk: '🛫-bon-voyage-2026',                         vlanId: 240, qosTag: 4 }, // takeoff emoji 4B + ASCII
    ],
  },
]

const REVOKED_ID = 'cust-002'

// Customer rotation in TerminalA only (the bridge rotation-bug repro target).
const ROTATED_BUILDING = 'TerminalA'
const ROTATED_ID = 'cust-003'
const ROTATED_NEW_PSK = 'rotated-monthly-2026-q4'

// Triple registrar rotation in TerminalA: v1 → v2 → v3 → v4.
const ROTATION_BUILDING = 'TerminalA'
const ROTATION_DEPTH = 4

// Late customer enrolled by the FINAL registrar after triple rotation.
const LATE_BUILDING = 'TerminalA'
const LATE_CUSTOMER: CustomerSignup = {
  id: 'cust-007',
  psk: 'redeye-flight-arrival',
  vlanId: 150,
  qosTag: 18,
}

const DEVICE_MODEL_TYPE = DeviceType.Router
const DEVICE_MODEL_MFG = 'DAWN'
const DEVICE_MODEL_NAME = 'AAA-Server-v1'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadKeypair(p: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
  return Keypair.fromSecretKey(Uint8Array.from(raw))
}

function phase(letter: string, title: string) {
  console.log()
  console.log(`──── PHASE ${letter}: ${title} ────`)
}

async function sendTx(
  conn: Connection,
  ix: TransactionInstruction,
  signers: Keypair[],
  label: string,
): Promise<string> {
  const tx = new Transaction().add(ix)
  tx.feePayer = signers[0].publicKey
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed')
  tx.recentBlockhash = blockhash
  tx.sign(...signers)
  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })
  const conf = await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  )
  if (conf.value.err) {
    throw new Error(`${label} failed: ${JSON.stringify(conf.value.err)}\n  ${sig}`)
  }
  console.log(`         [TX]   ${label}`)
  console.log(`                ${sig}`)
  return sig
}

async function fund(
  conn: Connection,
  from: Keypair,
  to: PublicKey,
  sol: number,
  label: string,
): Promise<void> {
  const ix = SystemProgram.transfer({
    fromPubkey: from.publicKey,
    toPubkey: to,
    lamports: Math.floor(sol * LAMPORTS_PER_SOL),
  })
  await sendTx(conn, ix, [from], `fund ${label} ${sol} SOL`)
}

function computeRegistrarPda(accessDomain: PublicKey, authority: PublicKey): PublicKey {
  const [pda] = domainAuthorityPda(
    { domain: accessDomain, role: DomainAuthorityRole.Registrar, authority },
    DEVNET_PROGRAM_ID,
  )
  return pda
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('═════════════════════════════════════════════════════════════')
  console.log('  DAWN MPSK AIRPORT scenario — devnet (post-fix verification)')
  console.log('═════════════════════════════════════════════════════════════')

  const conn = new Connection(RPC, 'confirmed')
  const operator = loadKeypair(KEYPAIR_PATH)

  const ops = Keypair.generate()

  const aRegistrars: Keypair[] = []
  for (let i = 0; i < ROTATION_DEPTH; i++) aRegistrars.push(Keypair.generate())
  const bRegistrar = Keypair.generate()

  const customerKps = new Map<string, Map<string, Keypair>>()
  for (const b of buildings) {
    const map = new Map<string, Keypair>()
    for (const c of b.customers) map.set(c.id, Keypair.generate())
    map.set(LATE_CUSTOMER.id, Keypair.generate())
    customerKps.set(b.label, map)
  }

  console.log(`  rpc:           ${RPC}`)
  console.log(`  program:       ${DEVNET_PROGRAM_ID.toBase58()}`)
  console.log(`  operator:      ${operator.publicKey.toBase58()}`)
  console.log(`  bridge:        ${BRIDGE_PUBKEY.toBase58()}`)
  console.log(`  ops wallet:    ${ops.publicKey.toBase58()}  (CPM on BOTH terminals)`)
  for (let i = 0; i < ROTATION_DEPTH; i++) {
    console.log(`  term-a-r-v${i + 1}:   ${aRegistrars[i].publicKey.toBase58()}`)
  }
  console.log(`  term-b-r-v1:   ${bRegistrar.publicKey.toBase58()}`)
  console.log(`  buildings:     ${buildings.map((b) => b.ssid).join(', ')}`)

  const operatorBalance = await conn.getBalance(operator.publicKey, 'confirmed')
  console.log(`  operator balance: ${(operatorBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`)
  if (operatorBalance < 0.5 * LAMPORTS_PER_SOL) {
    throw new Error('insufficient operator balance; top up before running')
  }

  // PDAs up front
  const [config] = configPda(DEVNET_PROGRAM_ID)
  const [aaaModel] = deviceModelPda(
    DEVICE_MODEL_TYPE, DEVICE_MODEL_MFG, DEVICE_MODEL_NAME, DEVNET_PROGRAM_ID,
  )
  for (const b of buildings) {
    const [aaaDevice] = devicePda(BRIDGE_PUBKEY, aaaModel, b.aaaDeviceName, b.aaaMac, DEVNET_PROGRAM_ID)
    const [aaaDeviceLoc] = deviceLocationPda(aaaDevice, DEVNET_PROGRAM_ID)
    const [aaaLocalDomain] = localDomainPda(BRIDGE_PUBKEY, b.aaaLocalDomainName, DEVNET_PROGRAM_ID)
    const [accessDomain] = accessDomainPda(operator.publicKey, b.ssid, DEVNET_PROGRAM_ID)
    const [authMethod] = authMethodPda(
      { accessDomain, methodType: AuthMethodType.Mpsk }, DEVNET_PROGRAM_ID,
    )
    b.pdas = { aaaDevice, aaaDeviceLoc, aaaLocalDomain, accessDomain, authMethod }
  }

  console.log('  PDAs:')
  for (const b of buildings) {
    console.log(`    ${b.label}:`)
    console.log(`      AAA Device:    ${b.pdas!.aaaDevice.toBase58()}`)
    console.log(`      AccessDomain:  ${b.pdas!.accessDomain.toBase58()}`)
    console.log(`      AuthMethod:    ${b.pdas!.authMethod.toBase58()}`)
  }

  const oneYearFromNow =
    BigInt(Math.floor(Date.now() / 1000)) + BigInt(365 * 24 * 60 * 60)

  // ===================================================================
  phase('A', 'Ensure AAA-Server-v1 DeviceModel exists (idempotent)')
  // ===================================================================
  const dmAcc = await conn.getAccountInfo(aaaModel, 'confirmed')
  if (dmAcc) {
    console.log(`         [skip] DeviceModel already exists at ${aaaModel.toBase58()}`)
  } else {
    await sendTx(
      conn,
      buildAddDeviceModel(
        { caller: operator.publicKey, config, deviceModel: aaaModel },
        { deviceType: DEVICE_MODEL_TYPE, manufacturer: DEVICE_MODEL_MFG, model: DEVICE_MODEL_NAME },
        DEVNET_PROGRAM_ID,
      ),
      [operator],
      'add_device_model:AAA-Server-v1',
    )
  }

  // ===================================================================
  phase('B', 'Register AAA Devices for both terminals (bridge becomes owner)')
  // ===================================================================
  for (const b of buildings) {
    await sendTx(
      conn,
      buildAddDeviceFor(
        {
          caller: operator.publicKey,
          beneficiary: BRIDGE_PUBKEY,
          deviceModel: aaaModel,
          device: b.pdas!.aaaDevice,
          deviceLocation: b.pdas!.aaaDeviceLoc,
          localDomain: b.pdas!.aaaLocalDomain,
        },
        {
          name: b.aaaDeviceName,
          height: 1,
          latitude: 47443300n + BigInt(buildings.indexOf(b) * 100),  // SEA-TAC-ish
          longitude: -122302700n,
          placement: [0, 0],
          macAddress: b.aaaMac,
          localDomainName: b.aaaLocalDomainName,
        },
        DEVNET_PROGRAM_ID,
      ),
      [operator],
      `add_device_for:${b.label} AAA(beneficiary=bridge)`,
    )
  }

  // ===================================================================
  phase('C', 'Create both AccessDomains (Nautobot-bridged with random UUIDs)')
  // ===================================================================
  for (const b of buildings) {
    await sendTx(
      conn,
      buildAddAccessDomain(
        { caller: operator.publicKey, accessDomain: b.pdas!.accessDomain },
        {
          name: b.ssid,
          controlPlaneDevice: b.pdas!.aaaDevice,
          gatewayDevice: null,
          localDomain: null,
          externalUuid: randomBytes(16),
        },
        DEVNET_PROGRAM_ID,
      ),
      [operator],
      `add_access_domain:${b.label}`,
    )
  }

  // ===================================================================
  phase('D', 'Register MPSK AuthMethod on both terminals (WPA3-PSK / AES-GCMP-256, tri-band)')
  // ===================================================================
  for (const b of buildings) {
    const params: PSKMethodParams = {
      ...defaultPskParams({ ssidLabel: b.ssid, bands: 'all' }),
      pskRotationIntervalSec: 3600,
      securityStandard: WiFiSecurityStandard.WPA3_PSK,
      encryptionAlgorithm: WiFiEncryption.AES_GCMP_256,
    }
    await sendTx(
      conn,
      buildRegisterAuthMethod(
        { caller: operator.publicKey, accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod },
        { methodType: AuthMethodType.Mpsk, parameters: encodePSKMethodParams(params) },
        DEVNET_PROGRAM_ID,
      ),
      [operator],
      `register_auth_method:${b.label}:Mpsk`,
    )
  }

  // ===================================================================
  phase('E', 'Fund + grant Registrar(v1) per terminal')
  // ===================================================================
  await fund(conn, operator, aRegistrars[0].publicKey, 0.05, 'term-a-r-v1')
  await fund(conn, operator, bRegistrar.publicKey, 0.05, 'term-b-r-v1')

  const aRegV1Pda = computeRegistrarPda(buildings[0].pdas!.accessDomain, aRegistrars[0].publicKey)
  await sendTx(
    conn,
    buildGrantDomainAuthorityForAccessDomain(
      { caller: operator.publicKey, accessDomain: buildings[0].pdas!.accessDomain, domainAuthority: aRegV1Pda },
      {
        role: DomainAuthorityRole.Registrar,
        authority: aRegistrars[0].publicKey,
        label: 'term-a-operator-api-v1',
        expiresAt: oneYearFromNow,
      },
      DEVNET_PROGRAM_ID,
    ),
    [operator],
    'grant_domain_authority:Registrar(term-a-v1)',
  )
  const bRegV1Pda = computeRegistrarPda(buildings[1].pdas!.accessDomain, bRegistrar.publicKey)
  await sendTx(
    conn,
    buildGrantDomainAuthorityForAccessDomain(
      { caller: operator.publicKey, accessDomain: buildings[1].pdas!.accessDomain, domainAuthority: bRegV1Pda },
      {
        role: DomainAuthorityRole.Registrar,
        authority: bRegistrar.publicKey,
        label: 'term-b-operator-api-v1',
        expiresAt: oneYearFromNow,
      },
      DEVNET_PROGRAM_ID,
    ),
    [operator],
    'grant_domain_authority:Registrar(term-b-v1)',
  )

  // ===================================================================
  phase('F', 'Fund + grant ConfigPlaneManager (same ops wallet, two terminals)')
  // ===================================================================
  await fund(conn, operator, ops.publicKey, 0.02, 'ops')
  for (const b of buildings) {
    const [opsCpmPda] = domainAuthorityPda(
      { domain: b.pdas!.accessDomain, role: DomainAuthorityRole.ConfigPlaneManager, authority: ops.publicKey },
      DEVNET_PROGRAM_ID,
    )
    await sendTx(
      conn,
      buildGrantDomainAuthorityForAccessDomain(
        { caller: operator.publicKey, accessDomain: b.pdas!.accessDomain, domainAuthority: opsCpmPda },
        {
          role: DomainAuthorityRole.ConfigPlaneManager,
          authority: ops.publicKey,
          label: `${b.label.toLowerCase()}-ops`,
          expiresAt: oneYearFromNow,
        },
        DEVNET_PROGRAM_ID,
      ),
      [operator],
      `grant_domain_authority:ConfigPlaneManager(${b.label}/ops)`,
    )
  }

  // ===================================================================
  phase('G', 'Bulk customer enrollment (interleaved across both terminals)')
  // ===================================================================
  for (let i = 0; i < buildings[0].customers.length; i++) {
    for (const b of buildings) {
      const c = b.customers[i]
      const ck = customerKps.get(b.label)!.get(c.id)!
      const [credPda] = credentialPda(
        { accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, authority: ck.publicKey },
        DEVNET_PROGRAM_ID,
      )
      const sealed = sealForRecipient(BRIDGE_PUBKEY, framePsk(c.psk))
      const registrar = b.label === 'TerminalA' ? aRegistrars[0] : bRegistrar
      const registrarPda = b.label === 'TerminalA' ? aRegV1Pda : bRegV1Pda
      const pskBytes = Buffer.byteLength(c.psk, 'utf8')
      await sendTx(
        conn,
        buildRegisterCredentialFor(
          {
            caller: registrar.publicKey,
            beneficiary: ck.publicKey,
            accessDomain: b.pdas!.accessDomain,
            authMethod: b.pdas!.authMethod,
            registrar: registrarPda,
            credential: credPda,
          },
          { vlanId: c.vlanId, qosTag: c.qosTag, sealedPayload: sealed },
          DEVNET_PROGRAM_ID,
        ),
        [registrar],
        `register_credential_for:${b.label}/${c.id} (${pskBytes}B utf-8, vlan=${c.vlanId} qos=${c.qosTag})`,
      )
    }
  }

  // ===================================================================
  phase('H', 'ops wallet drops 6GHz band on both terminals via update_auth_method_params')
  // ===================================================================
  for (const b of buildings) {
    const droppedSixGhz: PSKMethodParams = {
      ...defaultPskParams({ ssidLabel: b.ssid, bands: 'all' }),
      pskRotationIntervalSec: 3600,
      securityStandard: WiFiSecurityStandard.WPA3_PSK,
      encryptionAlgorithm: WiFiEncryption.AES_GCMP_256,
      ssid6GHz: '',
    }
    const [opsCpmPda] = domainAuthorityPda(
      { domain: b.pdas!.accessDomain, role: DomainAuthorityRole.ConfigPlaneManager, authority: ops.publicKey },
      DEVNET_PROGRAM_ID,
    )
    await sendTx(
      conn,
      buildUpdateAuthMethodParams(
        {
          caller: ops.publicKey,
          accessDomain: b.pdas!.accessDomain,
          authMethod: b.pdas!.authMethod,
          configPlaneManager: opsCpmPda,
        },
        { newParameters: encodePSKMethodParams(droppedSixGhz) },
        DEVNET_PROGRAM_ID,
      ),
      [ops],
      `update_auth_method_params:${b.label}:drop-6GHz`,
    )
  }

  // ===================================================================
  phase('I', `Revoke ${REVOKED_ID} in both terminals`)
  // ===================================================================
  for (const b of buildings) {
    const ck = customerKps.get(b.label)!.get(REVOKED_ID)!
    const [credPda] = credentialPda(
      { accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, authority: ck.publicKey },
      DEVNET_PROGRAM_ID,
    )
    await sendTx(
      conn,
      buildRevokeCredential(
        { caller: operator.publicKey, accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, credential: credPda },
        DEVNET_PROGRAM_ID,
      ),
      [operator],
      `revoke_credential:${b.label}/${REVOKED_ID}`,
    )
  }

  // ===================================================================
  phase('J', `Customer PSK rotation: ${ROTATED_BUILDING}/${ROTATED_ID} (revoke + re-register on same PDA)`)
  // ===================================================================
  {
    const b = buildings.find((x) => x.label === ROTATED_BUILDING)!
    const cBefore = b.customers.find((x) => x.id === ROTATED_ID)!
    const ck = customerKps.get(b.label)!.get(ROTATED_ID)!
    const [credPda] = credentialPda(
      { accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, authority: ck.publicKey },
      DEVNET_PROGRAM_ID,
    )

    await sendTx(
      conn,
      buildRevokeCredential(
        { caller: operator.publicKey, accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, credential: credPda },
        DEVNET_PROGRAM_ID,
      ),
      [operator],
      `revoke_credential:${b.label}/${ROTATED_ID} (rotation: old PSK '${cBefore.psk}')`,
    )

    const sealed = sealForRecipient(BRIDGE_PUBKEY, framePsk(ROTATED_NEW_PSK))
    await sendTx(
      conn,
      buildRegisterCredentialFor(
        {
          caller: aRegistrars[0].publicKey,
          beneficiary: ck.publicKey,
          accessDomain: b.pdas!.accessDomain,
          authMethod: b.pdas!.authMethod,
          registrar: aRegV1Pda,
          credential: credPda,
        },
        { vlanId: cBefore.vlanId, qosTag: cBefore.qosTag, sealedPayload: sealed },
        DEVNET_PROGRAM_ID,
      ),
      [aRegistrars[0]],
      `register_credential_for:${b.label}/${ROTATED_ID} (rotation: new PSK '${ROTATED_NEW_PSK}', same PDA)`,
    )
  }

  // ===================================================================
  phase('K', `Triple registrar rotation in ${ROTATION_BUILDING}: v1 → v2 → v3 → v4`)
  // ===================================================================
  {
    const b = buildings.find((x) => x.label === ROTATION_BUILDING)!
    let prevPda = aRegV1Pda
    for (let i = 1; i < ROTATION_DEPTH; i++) {
      await sendTx(
        conn,
        buildRevokeDomainAuthorityForAccessDomain(
          { caller: operator.publicKey, accessDomain: b.pdas!.accessDomain, domainAuthority: prevPda },
          DEVNET_PROGRAM_ID,
        ),
        [operator],
        `revoke_domain_authority:Registrar(term-a-v${i})`,
      )
      await fund(conn, operator, aRegistrars[i].publicKey, 0.04, `term-a-r-v${i + 1}`)
      const newPda = computeRegistrarPda(b.pdas!.accessDomain, aRegistrars[i].publicKey)
      await sendTx(
        conn,
        buildGrantDomainAuthorityForAccessDomain(
          { caller: operator.publicKey, accessDomain: b.pdas!.accessDomain, domainAuthority: newPda },
          {
            role: DomainAuthorityRole.Registrar,
            authority: aRegistrars[i].publicKey,
            label: `term-a-operator-api-v${i + 1}`,
            expiresAt: oneYearFromNow,
          },
          DEVNET_PROGRAM_ID,
        ),
        [operator],
        `grant_domain_authority:Registrar(term-a-v${i + 1})`,
      )
      prevPda = newPda
    }
  }

  // ===================================================================
  phase('L', `Late enrollment in ${LATE_BUILDING} via v${ROTATION_DEPTH} registrar`)
  // ===================================================================
  {
    const b = buildings.find((x) => x.label === LATE_BUILDING)!
    const ck = customerKps.get(b.label)!.get(LATE_CUSTOMER.id)!
    const finalRegistrar = aRegistrars[ROTATION_DEPTH - 1]
    const finalPda = computeRegistrarPda(b.pdas!.accessDomain, finalRegistrar.publicKey)
    const [credPda] = credentialPda(
      { accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, authority: ck.publicKey },
      DEVNET_PROGRAM_ID,
    )
    const sealed = sealForRecipient(BRIDGE_PUBKEY, framePsk(LATE_CUSTOMER.psk))
    await sendTx(
      conn,
      buildRegisterCredentialFor(
        {
          caller: finalRegistrar.publicKey,
          beneficiary: ck.publicKey,
          accessDomain: b.pdas!.accessDomain,
          authMethod: b.pdas!.authMethod,
          registrar: finalPda,
          credential: credPda,
        },
        { vlanId: LATE_CUSTOMER.vlanId, qosTag: LATE_CUSTOMER.qosTag, sealedPayload: sealed },
        DEVNET_PROGRAM_ID,
      ),
      [finalRegistrar],
      `register_credential_for:${LATE_BUILDING}/${LATE_CUSTOMER.id} (signed by v${ROTATION_DEPTH} registrar)`,
    )
  }

  // ===================================================================
  // Summary
  // ===================================================================
  console.log()
  console.log('═════════════════════════════════════════════════════════════')
  console.log('  Scenario complete — bridge state per terminal:')
  console.log('═════════════════════════════════════════════════════════════')
  for (const b of buildings) {
    console.log()
    console.log(`  ${b.label} (${b.ssid})`)
    console.log(`    AccessDomain: ${b.pdas!.accessDomain.toBase58()}`)
    console.log(`    AuthMethod:   ${b.pdas!.authMethod.toBase58()}  (params: 6GHz dropped)`)
    if (b.label === ROTATION_BUILDING) {
      console.log(`    Active Registrar: v${ROTATION_DEPTH} ${aRegistrars[ROTATION_DEPTH - 1].publicKey.toBase58()}`)
      console.log(`    Stale registrars (closed grants): v1..v${ROTATION_DEPTH - 1}`)
    } else {
      console.log(`    Active Registrar: ${bRegistrar.publicKey.toBase58()}`)
    }
    console.log(`    Live credentials:`)
    for (const c of b.customers) {
      if (c.id === REVOKED_ID) continue
      const ck = customerKps.get(b.label)!.get(c.id)!
      const [pda] = credentialPda(
        { accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, authority: ck.publicKey },
        DEVNET_PROGRAM_ID,
      )
      const psk = (b.label === ROTATED_BUILDING && c.id === ROTATED_ID) ? ROTATED_NEW_PSK : c.psk
      const psk_bytes = Buffer.byteLength(psk, 'utf8')
      console.log(`      ${c.id} → ${pda.toBase58()}  vlan=${c.vlanId} qos=${c.qosTag} psk=${JSON.stringify(psk)} (${psk_bytes}B)`)
    }
    if (b.label === LATE_BUILDING) {
      const ck = customerKps.get(b.label)!.get(LATE_CUSTOMER.id)!
      const [pda] = credentialPda(
        { accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, authority: ck.publicKey },
        DEVNET_PROGRAM_ID,
      )
      console.log(`      ${LATE_CUSTOMER.id} → ${pda.toBase58()}  vlan=${LATE_CUSTOMER.vlanId} qos=${LATE_CUSTOMER.qosTag} psk=${JSON.stringify(LATE_CUSTOMER.psk)} (${Buffer.byteLength(LATE_CUSTOMER.psk, 'utf8')}B)`)
    }
    console.log(`    Revoked: ${REVOKED_ID}`)
  }
  console.log()
  console.log(`  Solscan: https://solscan.io/account/${operator.publicKey.toBase58()}?cluster=devnet`)
  console.log('═════════════════════════════════════════════════════════════')
}

main().catch((err) => {
  console.error('airport scenario threw:', err)
  process.exit(1)
})
