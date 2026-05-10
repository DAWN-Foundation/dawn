#!/usr/bin/env -S node_modules/.bin/ts-node --transpile-only

/**
 * Dense multi-building MPSK scenario for SoT-bridge integration testing.
 *
 * Deliberately exercises every event class and PSK shape the bridge will
 * encounter in production:
 *
 * Two AccessDomains created in interleaved order ("MallNorth" + "MallSouth"):
 *   - shared operator (cold-admin / AccessDomain.owner)
 *   - distinct AAA Devices for each (control_plane_device differs per AD)
 *   - distinct Registrar wallets per building
 *   - one ConfigPlaneManager (ops wallet) granted on BOTH buildings
 *
 * Events you should see (and counts) — assumes the DeviceModel from a
 * previous run already exists and Phase A short-circuits:
 *
 *   2x DeviceAdded                         (one per AAA appliance)
 *   2x DeviceLocationAdded
 *   2x LocalDomainAdded                    (separate mgmt-LocalDomains)
 *   2x AccessDomainAdded                   ← bridge filter trigger
 *   2x AuthMethodRegistered                (Mpsk, tri-band, distinct SSIDs)
 *   2x DomainAuthorityGranted (Registrar v1 per building)
 *   2x DomainAuthorityGranted (ConfigPlaneManager — same ops wallet, two ADs)
 *  12x CredentialRegistered                (6 customers × 2 buildings)
 *   2x AuthMethodParamsUpdated             ← drop 6GHz on each building
 *   2x CredentialRevoked                   (cust-002 in each building)
 *   2x CredentialRevoked + 2x CredentialRegistered  (PSK rotation pattern)
 *   4x DomainAuthorityRevoked + 4x DomainAuthorityGranted  (triple rotation in MallNorth)
 *   1x CredentialRegistered                (cust-007 enrolled by v4 registrar)
 *
 *   Total: ~41 events
 *
 * PSK shape coverage:
 *   - extreme short (4 bytes)
 *   - typical (16-23 bytes)
 *   - unicode multi-byte (~22 bytes)
 *   - special chars
 *   - long (50+ bytes, near the 63-byte limit)
 *   - emoji (4-byte UTF-8 codepoints)
 *
 * Customer keypairs are ephemeral per run — rerun freely; previous-run
 * accounts are independent of this run's PDAs.
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

// Two buildings, two AAA devices, two MAC addresses.
interface Building {
  label: string
  ssid: string
  aaaDeviceName: string
  aaaLocalDomainName: string
  aaaMac: number[]
  customers: CustomerSignup[]
  // populated at runtime
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
    label: 'MallNorth',
    ssid: `MallNorth-${SUFFIX}`,
    aaaDeviceName: `aaa-north-${SUFFIX}`,
    aaaLocalDomainName: `mall-north-mgmt-${SUFFIX}`,
    aaaMac: [0x02, 0xaa, 0x4e, 0x00, 0x00, SUFFIX & 0xff],
    customers: [
      { id: 'cust-001', psk: 'north-mocha-2026!',                    vlanId: 42,  qosTag: 46 },
      { id: 'cust-002', psk: '12345678',                              vlanId: null, qosTag: null }, // short, will be revoked
      { id: 'cust-003', psk: 'north-rotates-quarterly',              vlanId: 100, qosTag: 26 }, // will be rotated
      { id: 'cust-004', psk: 'café-bistro-€spécial',                 vlanId: 30,  qosTag: 18 }, // unicode multi-byte
      { id: 'cust-005', psk: 'P@ssw0rd!#$%^&*()',                    vlanId: 20,  qosTag: 0 },  // special chars
      { id: 'cust-006', psk: 'very-long-passphrase-with-spaces-and-numbers-789012', vlanId: 200, qosTag: 8 }, // 50 bytes
    ],
  },
  {
    label: 'MallSouth',
    ssid: `MallSouth-${SUFFIX}`,
    aaaDeviceName: `aaa-south-${SUFFIX}`,
    aaaLocalDomainName: `mall-south-mgmt-${SUFFIX}`,
    aaaMac: [0x02, 0xaa, 0x53, 0x00, 0x00, SUFFIX & 0xff],
    customers: [
      { id: 'cust-001', psk: 'south-latte-2026',                     vlanId: 42,  qosTag: 46 },
      { id: 'cust-002', psk: '9876',                                 vlanId: null, qosTag: null }, // 4-byte minimum, will be revoked
      { id: 'cust-003', psk: 'south-cookie-station',                 vlanId: 100, qosTag: 26 },
      { id: 'cust-004', psk: 'naïveté-rendez-vous',                  vlanId: 30,  qosTag: 18 }, // unicode
      { id: 'cust-005', psk: 'guest-2_QwErTy',                       vlanId: 20,  qosTag: 0 },
      { id: 'cust-006', psk: '🌮-taco-tuesday-special',              vlanId: 60,  qosTag: 4 }, // emoji + utf-8
    ],
  },
]

// Customer to revoke in each building.
const REVOKED_ID = 'cust-002'

// Customer rotation (close + re-register on same beneficiary PDA).
const ROTATED_BUILDING = 'MallNorth'
const ROTATED_ID = 'cust-003'
const ROTATED_NEW_PSK = 'rotated-quarterly-q4-2026'

// Triple registrar rotation in MallNorth: v1 → v2 → v3 → v4.
const ROTATION_BUILDING = 'MallNorth'
const ROTATION_DEPTH = 4 // total registrar identities used; rotation happens 3 times

// Late customer enrolled by the FINAL registrar after triple rotation.
const LATE_BUILDING = 'MallNorth'
const LATE_CUSTOMER: CustomerSignup = {
  id: 'cust-007',
  psk: 'late-night-shift-2026',
  vlanId: 50,
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('═════════════════════════════════════════════════════════════')
  console.log('  DAWN MPSK MALL scenario — devnet (multi-building, dense)')
  console.log('═════════════════════════════════════════════════════════════')

  const conn = new Connection(RPC, 'confirmed')
  const operator = loadKeypair(KEYPAIR_PATH)

  // One ops wallet shared across both buildings — gets ConfigPlaneManager
  // grants on both ADs.
  const ops = Keypair.generate()

  // Per-building registrars. MallNorth gets multiple for the rotation tests.
  const northRegistrars: Keypair[] = []
  for (let i = 0; i < ROTATION_DEPTH; i++) northRegistrars.push(Keypair.generate())
  const southRegistrar = Keypair.generate()

  // Customer keypairs per building.
  const customerKps = new Map<string, Map<string, Keypair>>()
  for (const b of buildings) {
    const map = new Map<string, Keypair>()
    for (const c of b.customers) map.set(c.id, Keypair.generate())
    map.set(LATE_CUSTOMER.id, Keypair.generate())  // late customer (only used in LATE_BUILDING)
    customerKps.set(b.label, map)
  }

  console.log(`  rpc:           ${RPC}`)
  console.log(`  program:       ${DEVNET_PROGRAM_ID.toBase58()}`)
  console.log(`  operator:      ${operator.publicKey.toBase58()}`)
  console.log(`  bridge:        ${BRIDGE_PUBKEY.toBase58()}`)
  console.log(`  ops wallet:    ${ops.publicKey.toBase58()}  (ConfigPlaneManager on BOTH buildings)`)
  for (let i = 0; i < ROTATION_DEPTH; i++) {
    console.log(`  north-r-v${i + 1}:    ${northRegistrars[i].publicKey.toBase58()}`)
  }
  console.log(`  south-r-v1:    ${southRegistrar.publicKey.toBase58()}`)
  console.log(`  buildings:     ${buildings.map((b) => b.ssid).join(', ')}`)

  const operatorBalance = await conn.getBalance(operator.publicKey, 'confirmed')
  console.log(`  operator balance: ${(operatorBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`)
  if (operatorBalance < 0.5 * LAMPORTS_PER_SOL) {
    throw new Error('insufficient operator balance; top up before running')
  }

  // Compute every PDA up front.
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
  // PHASE A — DeviceModel (idempotent)
  // ===================================================================
  phase('A', 'Ensure AAA-Server-v1 DeviceModel exists (idempotent)')
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
  // PHASE B — register AAA Device for both buildings (interleaved)
  // ===================================================================
  phase('B', 'Register AAA Devices for both buildings (bridge becomes owner)')
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
          latitude: 37774900n + BigInt(buildings.indexOf(b) * 100),
          longitude: -122419400n,
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
  // PHASE C — create both AccessDomains (interleaved)
  // ===================================================================
  phase('C', 'Create both AccessDomains (Nautobot-bridged with random UUIDs)')
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
  // PHASE D — register AuthMethod on both
  // ===================================================================
  phase('D', 'Register MPSK AuthMethod on both buildings (WPA3-PSK / AES-GCMP-256, tri-band)')
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
  // PHASE E — Registrar v1 grants per building
  // ===================================================================
  phase('E', 'Fund + grant Registrar(v1) per building')
  await fund(conn, operator, northRegistrars[0].publicKey, 0.05, 'north-r-v1')
  await fund(conn, operator, southRegistrar.publicKey, 0.05, 'south-r-v1')

  const northRegV1Pda = computeRegistrarPda(buildings[0].pdas!.accessDomain, northRegistrars[0].publicKey)
  await sendTx(
    conn,
    buildGrantDomainAuthorityForAccessDomain(
      { caller: operator.publicKey, accessDomain: buildings[0].pdas!.accessDomain, domainAuthority: northRegV1Pda },
      {
        role: DomainAuthorityRole.Registrar,
        authority: northRegistrars[0].publicKey,
        label: 'north-operator-api-v1',
        expiresAt: oneYearFromNow,
      },
      DEVNET_PROGRAM_ID,
    ),
    [operator],
    'grant_domain_authority:Registrar(north-v1)',
  )
  const southRegV1Pda = computeRegistrarPda(buildings[1].pdas!.accessDomain, southRegistrar.publicKey)
  await sendTx(
    conn,
    buildGrantDomainAuthorityForAccessDomain(
      { caller: operator.publicKey, accessDomain: buildings[1].pdas!.accessDomain, domainAuthority: southRegV1Pda },
      {
        role: DomainAuthorityRole.Registrar,
        authority: southRegistrar.publicKey,
        label: 'south-operator-api-v1',
        expiresAt: oneYearFromNow,
      },
      DEVNET_PROGRAM_ID,
    ),
    [operator],
    'grant_domain_authority:Registrar(south-v1)',
  )

  // ===================================================================
  // PHASE F — ConfigPlaneManager grants (same ops wallet on both)
  // ===================================================================
  phase('F', 'Fund + grant ConfigPlaneManager (same ops wallet, two distinct grants)')
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
  // PHASE G — Bulk customer enrollment (12 across both buildings, interleaved)
  // ===================================================================
  phase('G', 'Bulk customer enrollment (interleaved across both buildings)')
  for (let i = 0; i < buildings[0].customers.length; i++) {
    for (const b of buildings) {
      const c = b.customers[i]
      const ck = customerKps.get(b.label)!.get(c.id)!
      const [credPda] = credentialPda(
        { accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, authority: ck.publicKey },
        DEVNET_PROGRAM_ID,
      )
      const sealed = sealForRecipient(BRIDGE_PUBKEY, framePsk(c.psk))
      const registrar = b.label === 'MallNorth' ? northRegistrars[0] : southRegistrar
      const registrarPda = b.label === 'MallNorth' ? northRegV1Pda : southRegV1Pda
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
  // PHASE H — ops drops 6GHz on each building (AuthMethodParamsUpdated × 2)
  // ===================================================================
  phase('H', 'ops wallet drops 6GHz band on both buildings via update_auth_method_params')
  for (const b of buildings) {
    const droppedSixGhz: PSKMethodParams = {
      ...defaultPskParams({ ssidLabel: b.ssid, bands: 'all' }),
      pskRotationIntervalSec: 3600,
      securityStandard: WiFiSecurityStandard.WPA3_PSK,
      encryptionAlgorithm: WiFiEncryption.AES_GCMP_256,
      ssid6GHz: '', // drop the 6GHz band
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
  // PHASE I — revoke cust-002 in each building
  // ===================================================================
  phase('I', `Revoke ${REVOKED_ID} in both buildings`)
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
  // PHASE J — customer PSK rotation (revoke + re-register on same beneficiary)
  // ===================================================================
  phase('J', `Customer PSK rotation: ${ROTATED_BUILDING}/${ROTATED_ID} (revoke + re-register on same PDA)`)
  {
    const b = buildings.find((x) => x.label === ROTATED_BUILDING)!
    const cBefore = b.customers.find((x) => x.id === ROTATED_ID)!
    const ck = customerKps.get(b.label)!.get(ROTATED_ID)!
    const [credPda] = credentialPda(
      { accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, authority: ck.publicKey },
      DEVNET_PROGRAM_ID,
    )

    // Revoke old.
    await sendTx(
      conn,
      buildRevokeCredential(
        { caller: operator.publicKey, accessDomain: b.pdas!.accessDomain, authMethod: b.pdas!.authMethod, credential: credPda },
        DEVNET_PROGRAM_ID,
      ),
      [operator],
      `revoke_credential:${b.label}/${ROTATED_ID} (rotation: old PSK '${cBefore.psk}')`,
    )

    // Re-register with new PSK at the SAME PDA (Anchor init succeeds because the account was closed).
    const sealed = sealForRecipient(BRIDGE_PUBKEY, framePsk(ROTATED_NEW_PSK))
    await sendTx(
      conn,
      buildRegisterCredentialFor(
        {
          caller: northRegistrars[0].publicKey,
          beneficiary: ck.publicKey,
          accessDomain: b.pdas!.accessDomain,
          authMethod: b.pdas!.authMethod,
          registrar: northRegV1Pda,
          credential: credPda,
        },
        { vlanId: cBefore.vlanId, qosTag: cBefore.qosTag, sealedPayload: sealed },
        DEVNET_PROGRAM_ID,
      ),
      [northRegistrars[0]],
      `register_credential_for:${b.label}/${ROTATED_ID} (rotation: new PSK '${ROTATED_NEW_PSK}', same PDA)`,
    )
  }

  // ===================================================================
  // PHASE K — triple registrar rotation in MallNorth: v1 → v2 → v3 → v4
  // ===================================================================
  phase('K', `Triple registrar rotation in ${ROTATION_BUILDING}: v1 → v2 → v3 → v4`)
  {
    const b = buildings.find((x) => x.label === ROTATION_BUILDING)!
    let prevPda = northRegV1Pda
    for (let i = 1; i < ROTATION_DEPTH; i++) {
      // Revoke previous.
      await sendTx(
        conn,
        buildRevokeDomainAuthorityForAccessDomain(
          { caller: operator.publicKey, accessDomain: b.pdas!.accessDomain, domainAuthority: prevPda },
          DEVNET_PROGRAM_ID,
        ),
        [operator],
        `revoke_domain_authority:Registrar(north-v${i})`,
      )
      // Fund + grant next.
      await fund(conn, operator, northRegistrars[i].publicKey, 0.04, `north-r-v${i + 1}`)
      const newPda = computeRegistrarPda(b.pdas!.accessDomain, northRegistrars[i].publicKey)
      await sendTx(
        conn,
        buildGrantDomainAuthorityForAccessDomain(
          { caller: operator.publicKey, accessDomain: b.pdas!.accessDomain, domainAuthority: newPda },
          {
            role: DomainAuthorityRole.Registrar,
            authority: northRegistrars[i].publicKey,
            label: `north-operator-api-v${i + 1}`,
            expiresAt: oneYearFromNow,
          },
          DEVNET_PROGRAM_ID,
        ),
        [operator],
        `grant_domain_authority:Registrar(north-v${i + 1})`,
      )
      prevPda = newPda
    }
  }

  // ===================================================================
  // PHASE L — late customer enrolled by the FINAL registrar (v4)
  // ===================================================================
  phase('L', `Late enrollment in ${LATE_BUILDING} via v${ROTATION_DEPTH} registrar`)
  {
    const b = buildings.find((x) => x.label === LATE_BUILDING)!
    const ck = customerKps.get(b.label)!.get(LATE_CUSTOMER.id)!
    const finalRegistrar = northRegistrars[ROTATION_DEPTH - 1]
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
  // Final summary
  // ===================================================================
  console.log()
  console.log('═════════════════════════════════════════════════════════════')
  console.log('  Scenario complete — bridge state per building:')
  console.log('═════════════════════════════════════════════════════════════')
  for (const b of buildings) {
    console.log()
    console.log(`  ${b.label} (${b.ssid})`)
    console.log(`    AccessDomain: ${b.pdas!.accessDomain.toBase58()}`)
    console.log(`    AuthMethod:   ${b.pdas!.authMethod.toBase58()}  (params: 6GHz dropped)`)
    if (b.label === ROTATION_BUILDING) {
      console.log(`    Active Registrar: v${ROTATION_DEPTH} ${northRegistrars[ROTATION_DEPTH - 1].publicKey.toBase58()}`)
      console.log(`    Stale registrars (closed grants): v1..v${ROTATION_DEPTH - 1}`)
    } else {
      console.log(`    Active Registrar: ${southRegistrar.publicKey.toBase58()}`)
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

function computeRegistrarPda(accessDomain: PublicKey, authority: PublicKey): PublicKey {
  const [pda] = domainAuthorityPda(
    { domain: accessDomain, role: DomainAuthorityRole.Registrar, authority },
    DEVNET_PROGRAM_ID,
  )
  return pda
}

main().catch((err) => {
  console.error('mall scenario threw:', err)
  process.exit(1)
})
