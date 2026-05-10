#!/usr/bin/env -S node_modules/.bin/ts-node --transpile-only

/**
 * End-to-end "MPSK building" scenario, run live against devnet.
 *
 * Mirrors sim/scenario-mpsk-production.ts but talks to a real RPC
 * instead of bankrun, so an external SoT-bridge subscribed to the
 * program can observe every event in real time.
 *
 * Roles:
 *   operator (= deployer wallet, signs)
 *     - cold-admin authority on Config
 *     - AccessDomain.owner; signs add_access_domain, register_auth_method,
 *       grant/revoke_domain_authority_for_access_domain, revoke_credential
 *   bridge (= 2tXxypDNQbJU6wqxodttDbvSZN2Nebuzypps1huH3ZsF)
 *     - control-plane authority. Owns the AAA Device PDA (registered via
 *       add_device_for in this script).
 *     - sealed_payloads in this scenario are encrypted to its pubkey.
 *     - this script does NOT sign with the bridge key; it never has it.
 *   registrar (= ephemeral keypair generated per-run)
 *     - hot operator-api wallet. Receives a DomainAuthority{Registrar} grant.
 *     - signs register_credential_for for each customer enrollment.
 *
 * Phases:
 *   A. DeviceModel registration (idempotent — operator-side, gated on Config)
 *   B. AAA Device registered FOR the bridge (operator pays, bridge=owner)
 *   C. AccessDomain create (operator)
 *   D. AuthMethod (Mpsk, tri-band) register (operator)
 *   E. Fund + grant Registrar (operator)
 *   F. 5 customer enrollments by Registrar
 *   G. 1 revocation (operator)
 *   H. Registrar rotation: revoke v1, grant v2 (operator)
 *   I. 1 more enrollment by v2 Registrar
 *
 * Each run generates a unique building name (timestamp suffix) so re-runs
 * don't collide with previously-created accounts. Customer keypairs are
 * also fresh per run.
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

// Building config
const BUILDING_SUFFIX = Math.floor(Date.now() / 1000) % 1_000_000
const SSID = `CafeWifi-${BUILDING_SUFFIX}`
const AAA_DEVICE_NAME = `cafe-aaa-${BUILDING_SUFFIX}`
const AAA_LOCAL_DOMAIN_NAME = `cafe-aaa-mgmt-${BUILDING_SUFFIX}`
const AAA_MAC: number[] = [0x02, 0xaa, 0xaa, 0x00, 0x00, BUILDING_SUFFIX & 0xff]
const NAUTOBOT_SITE_UUID = randomBytes(16) // simulated Nautobot site UUID

const DEVICE_MODEL_TYPE = DeviceType.Router
const DEVICE_MODEL_MFG = 'DAWN'
const DEVICE_MODEL_NAME = 'AAA-Server-v1'

interface CustomerSignup {
  id: string
  psk: string
  vlanId: number | null
  qosTag: number | null
}

const customers: CustomerSignup[] = [
  { id: 'cust-001', psk: 'cafe-mocha-2026!',          vlanId: 42,   qosTag: 46 }, // EF
  { id: 'cust-002', psk: 'flatwhite-friday',          vlanId: null, qosTag: null },
  { id: 'cust-003', psk: 'oat-milk-strong',           vlanId: 100,  qosTag: 26 },
  { id: 'cust-004', psk: 'guest-rotates-daily',       vlanId: 200,  qosTag: 0 },
  { id: 'cust-005', psk: 'lobby-tablet-permanent',    vlanId: 50,   qosTag: 18 },
]

// Customer to revoke mid-scenario.
const REVOKED_CUSTOMER = 'cust-002'

// Customer enrolled by the rotated v2 registrar.
const LATE_CUSTOMER: CustomerSignup = {
  id: 'cust-006',
  psk: 'late-arrival-2026',
  vlanId: 42,
  qosTag: 46,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadKeypair(p: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
  return Keypair.fromSecretKey(Uint8Array.from(raw))
}

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: string) {
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`         [${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (ok) pass += 1
  else { fail += 1; process.exitCode = 1 }
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

async function maybeFetchAccount(conn: Connection, pk: PublicKey) {
  const a = await conn.getAccountInfo(pk, 'confirmed')
  return a
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('═════════════════════════════════════════════════════════════')
  console.log('  DAWN MPSK building scenario — devnet')
  console.log('═════════════════════════════════════════════════════════════')

  const conn = new Connection(RPC, 'confirmed')
  const operator = loadKeypair(KEYPAIR_PATH)

  const registrarV1 = Keypair.generate()
  const registrarV2 = Keypair.generate()

  console.log(`  rpc:           ${RPC}`)
  console.log(`  program:       ${DEVNET_PROGRAM_ID.toBase58()}`)
  console.log(`  operator:      ${operator.publicKey.toBase58()}`)
  console.log(`  bridge:        ${BRIDGE_PUBKEY.toBase58()}  (control-plane / decryption authority)`)
  console.log(`  registrar v1:  ${registrarV1.publicKey.toBase58()}  (ephemeral, this run)`)
  console.log(`  registrar v2:  ${registrarV2.publicKey.toBase58()}  (ephemeral, this run, post-rotation)`)
  console.log(`  building SSID: ${SSID}`)
  console.log(`  Nautobot UUID: ${NAUTOBOT_SITE_UUID.toString('hex')}`)
  console.log()

  // Pre-flight: confirm program is alive + operator has SOL.
  const programAcc = await conn.getAccountInfo(DEVNET_PROGRAM_ID, 'confirmed')
  check('program is deployed and executable', programAcc != null && programAcc.executable)
  const operatorBalance = await conn.getBalance(operator.publicKey, 'confirmed')
  console.log(`  operator balance: ${(operatorBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`)
  if (operatorBalance < 0.5 * LAMPORTS_PER_SOL) {
    throw new Error('insufficient operator balance; top up before running')
  }

  // Compute every PDA up front so the log shows the full picture.
  const [config] = configPda(DEVNET_PROGRAM_ID)
  const [aaaModel] = deviceModelPda(
    DEVICE_MODEL_TYPE,
    DEVICE_MODEL_MFG,
    DEVICE_MODEL_NAME,
    DEVNET_PROGRAM_ID,
  )
  const [aaaDevice] = devicePda(BRIDGE_PUBKEY, aaaModel, AAA_DEVICE_NAME, AAA_MAC, DEVNET_PROGRAM_ID)
  const [aaaDeviceLoc] = deviceLocationPda(aaaDevice, DEVNET_PROGRAM_ID)
  const [aaaLocalDomain] = localDomainPda(BRIDGE_PUBKEY, AAA_LOCAL_DOMAIN_NAME, DEVNET_PROGRAM_ID)
  const [accessDomain] = accessDomainPda(operator.publicKey, SSID, DEVNET_PROGRAM_ID)
  const [authMethod] = authMethodPda(
    { accessDomain, methodType: AuthMethodType.Mpsk },
    DEVNET_PROGRAM_ID,
  )
  const [registrarV1Pda] = domainAuthorityPda(
    { domain: accessDomain, role: DomainAuthorityRole.Registrar, authority: registrarV1.publicKey },
    DEVNET_PROGRAM_ID,
  )
  const [registrarV2Pda] = domainAuthorityPda(
    { domain: accessDomain, role: DomainAuthorityRole.Registrar, authority: registrarV2.publicKey },
    DEVNET_PROGRAM_ID,
  )

  console.log('  PDAs:')
  console.log(`    DeviceModel(AAA-Server-v1): ${aaaModel.toBase58()}`)
  console.log(`    AAA Device:                 ${aaaDevice.toBase58()}`)
  console.log(`    AAA DeviceLocation:         ${aaaDeviceLoc.toBase58()}`)
  console.log(`    AAA LocalDomain:            ${aaaLocalDomain.toBase58()}`)
  console.log(`    AccessDomain:               ${accessDomain.toBase58()}`)
  console.log(`    AuthMethod (Mpsk):          ${authMethod.toBase58()}`)
  console.log(`    Registrar v1 grant:         ${registrarV1Pda.toBase58()}`)
  console.log(`    Registrar v2 grant:         ${registrarV2Pda.toBase58()}`)

  // -------------------------------------------------------------------
  phase('A', 'Register AAA-Server-v1 DeviceModel (Config-gated)')
  // -------------------------------------------------------------------
  if (await maybeFetchAccount(conn, aaaModel)) {
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

  // -------------------------------------------------------------------
  phase('B', "Register AAA Device for the SoT-bridge (bridge becomes owner)")
  // -------------------------------------------------------------------
  await sendTx(
    conn,
    buildAddDeviceFor(
      {
        caller: operator.publicKey,
        beneficiary: BRIDGE_PUBKEY,
        deviceModel: aaaModel,
        device: aaaDevice,
        deviceLocation: aaaDeviceLoc,
        localDomain: aaaLocalDomain,
      },
      {
        name: AAA_DEVICE_NAME,
        height: 1,
        latitude: 37774900n,
        longitude: -122419400n,
        placement: [0, 0],
        macAddress: AAA_MAC,
        localDomainName: AAA_LOCAL_DOMAIN_NAME,
      },
      DEVNET_PROGRAM_ID,
    ),
    [operator],
    'add_device_for:AAA(beneficiary=bridge)',
  )

  // -------------------------------------------------------------------
  phase('C', `Create AccessDomain "${SSID}" (Nautobot-bridged)`)
  // -------------------------------------------------------------------
  await sendTx(
    conn,
    buildAddAccessDomain(
      { caller: operator.publicKey, accessDomain },
      {
        name: SSID,
        controlPlaneDevice: aaaDevice,
        gatewayDevice: null,
        localDomain: null,
        externalUuid: NAUTOBOT_SITE_UUID,
      },
      DEVNET_PROGRAM_ID,
    ),
    [operator],
    'add_access_domain',
  )

  // -------------------------------------------------------------------
  phase('D', 'Register MPSK AuthMethod (WPA3-PSK / AES-GCMP-256, tri-band)')
  // -------------------------------------------------------------------
  const params: PSKMethodParams = {
    ...defaultPskParams({ ssidLabel: SSID, bands: 'all' }),
    pskRotationIntervalSec: 3600,
    securityStandard: WiFiSecurityStandard.WPA3_PSK,
    encryptionAlgorithm: WiFiEncryption.AES_GCMP_256,
  }
  const params256 = encodePSKMethodParams(params)
  await sendTx(
    conn,
    buildRegisterAuthMethod(
      { caller: operator.publicKey, accessDomain, authMethod },
      { methodType: AuthMethodType.Mpsk, parameters: params256 },
      DEVNET_PROGRAM_ID,
    ),
    [operator],
    'register_auth_method:Mpsk',
  )

  // -------------------------------------------------------------------
  phase('E', 'Fund + grant Registrar v1 (operator-api hot wallet)')
  // -------------------------------------------------------------------
  await fund(conn, operator, registrarV1.publicKey, 0.05, 'registrar v1')
  const oneYearFromNow =
    BigInt(Math.floor(Date.now() / 1000)) + BigInt(365 * 24 * 60 * 60)
  await sendTx(
    conn,
    buildGrantDomainAuthorityForAccessDomain(
      { caller: operator.publicKey, accessDomain, domainAuthority: registrarV1Pda },
      {
        role: DomainAuthorityRole.Registrar,
        authority: registrarV1.publicKey,
        label: 'operator-api-v1',
        expiresAt: oneYearFromNow,
      },
      DEVNET_PROGRAM_ID,
    ),
    [operator],
    'grant_domain_authority:Registrar(v1)',
  )

  // -------------------------------------------------------------------
  phase('F', `Registrar v1 enrolls ${customers.length} customers`)
  // -------------------------------------------------------------------
  const customerKeypairs = new Map<string, Keypair>()
  for (const c of customers) {
    const ck = Keypair.generate()
    customerKeypairs.set(c.id, ck)
    const [credPda] = credentialPda(
      { accessDomain, authMethod, authority: ck.publicKey },
      DEVNET_PROGRAM_ID,
    )
    const sealed = sealForRecipient(BRIDGE_PUBKEY, framePsk(c.psk))
    await sendTx(
      conn,
      buildRegisterCredentialFor(
        {
          caller: registrarV1.publicKey,
          beneficiary: ck.publicKey,
          accessDomain,
          authMethod,
          registrar: registrarV1Pda,
          credential: credPda,
        },
        { vlanId: c.vlanId, qosTag: c.qosTag, sealedPayload: sealed },
        DEVNET_PROGRAM_ID,
      ),
      [registrarV1],
      `register_credential_for:${c.id} (vlan=${c.vlanId} qos=${c.qosTag})`,
    )
  }

  // -------------------------------------------------------------------
  phase('G', `Operator revokes ${REVOKED_CUSTOMER} (direct cleanup)`)
  // -------------------------------------------------------------------
  {
    const ck = customerKeypairs.get(REVOKED_CUSTOMER)!
    const [credPda] = credentialPda(
      { accessDomain, authMethod, authority: ck.publicKey },
      DEVNET_PROGRAM_ID,
    )
    await sendTx(
      conn,
      buildRevokeCredential(
        { caller: operator.publicKey, accessDomain, authMethod, credential: credPda },
        DEVNET_PROGRAM_ID,
      ),
      [operator],
      `revoke_credential:${REVOKED_CUSTOMER}`,
    )
  }

  // -------------------------------------------------------------------
  phase('H', 'Registrar rotation: revoke v1, grant v2')
  // -------------------------------------------------------------------
  await sendTx(
    conn,
    buildRevokeDomainAuthorityForAccessDomain(
      { caller: operator.publicKey, accessDomain, domainAuthority: registrarV1Pda },
      DEVNET_PROGRAM_ID,
    ),
    [operator],
    'revoke_domain_authority:Registrar(v1)',
  )
  await fund(conn, operator, registrarV2.publicKey, 0.05, 'registrar v2')
  await sendTx(
    conn,
    buildGrantDomainAuthorityForAccessDomain(
      { caller: operator.publicKey, accessDomain, domainAuthority: registrarV2Pda },
      {
        role: DomainAuthorityRole.Registrar,
        authority: registrarV2.publicKey,
        label: 'operator-api-v2',
        expiresAt: oneYearFromNow,
      },
      DEVNET_PROGRAM_ID,
    ),
    [operator],
    'grant_domain_authority:Registrar(v2)',
  )

  // -------------------------------------------------------------------
  phase('I', `Registrar v2 enrolls ${LATE_CUSTOMER.id} (post-rotation)`)
  // -------------------------------------------------------------------
  {
    const ck = Keypair.generate()
    customerKeypairs.set(LATE_CUSTOMER.id, ck)
    const [credPda] = credentialPda(
      { accessDomain, authMethod, authority: ck.publicKey },
      DEVNET_PROGRAM_ID,
    )
    const sealed = sealForRecipient(BRIDGE_PUBKEY, framePsk(LATE_CUSTOMER.psk))
    await sendTx(
      conn,
      buildRegisterCredentialFor(
        {
          caller: registrarV2.publicKey,
          beneficiary: ck.publicKey,
          accessDomain,
          authMethod,
          registrar: registrarV2Pda,
          credential: credPda,
        },
        {
          vlanId: LATE_CUSTOMER.vlanId,
          qosTag: LATE_CUSTOMER.qosTag,
          sealedPayload: sealed,
        },
        DEVNET_PROGRAM_ID,
      ),
      [registrarV2],
      `register_credential_for:${LATE_CUSTOMER.id} (vlan=${LATE_CUSTOMER.vlanId} qos=${LATE_CUSTOMER.qosTag})`,
    )
  }

  // -------------------------------------------------------------------
  // Final summary
  // -------------------------------------------------------------------
  console.log()
  console.log('═════════════════════════════════════════════════════════════')
  console.log('  Scenario complete — what the SoT-bridge should now hold:')
  console.log('═════════════════════════════════════════════════════════════')
  console.log(`  AccessDomain:  ${accessDomain.toBase58()}  (${SSID})`)
  console.log(`  AuthMethod:    ${authMethod.toBase58()}  (Mpsk, tri-band)`)
  console.log(`  Active Registrar: v2 ${registrarV2.publicKey.toBase58()}`)
  console.log(`  Live credentials:`)
  for (const c of customers) {
    if (c.id === REVOKED_CUSTOMER) continue
    const ck = customerKeypairs.get(c.id)!
    const [pda] = credentialPda(
      { accessDomain, authMethod, authority: ck.publicKey },
      DEVNET_PROGRAM_ID,
    )
    console.log(`    ${c.id}: ${pda.toBase58()}  (vlan=${c.vlanId} qos=${c.qosTag} psk='${c.psk}')`)
  }
  {
    const ck = customerKeypairs.get(LATE_CUSTOMER.id)!
    const [pda] = credentialPda(
      { accessDomain, authMethod, authority: ck.publicKey },
      DEVNET_PROGRAM_ID,
    )
    console.log(`    ${LATE_CUSTOMER.id}: ${pda.toBase58()}  (vlan=${LATE_CUSTOMER.vlanId} qos=${LATE_CUSTOMER.qosTag} psk='${LATE_CUSTOMER.psk}')`)
  }
  console.log()
  console.log(`  Revoked: ${REVOKED_CUSTOMER} (bridge should drop from RADIUS)`)
  console.log(`  Stale Registrar grant (closed): v1 ${registrarV1.publicKey.toBase58()}`)
  console.log()
  console.log(`  AccessDomain on Solscan:`)
  console.log(`  https://solscan.io/account/${accessDomain.toBase58()}?cluster=devnet`)
  console.log('═════════════════════════════════════════════════════════════')

  if (fail > 0) {
    console.error(`${fail} pre-flight check(s) failed`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('mpsk scenario threw:', err)
  process.exit(1)
})
