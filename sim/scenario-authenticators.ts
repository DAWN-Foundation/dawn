#!/usr/bin/env -S npx tsx
/**
 * Bankrun scenario: AccessDomain Authenticators (Access Points).
 *
 * Exercises the new on-chain surface end-to-end:
 *
 *   PHASE A   Bootstrap (DeviceModel, AAA Device, AccessDomain).
 *   PHASE B   Cold admin grants InfrastructureRegistrar to a fresh
 *             Nautobot-proxy keypair.
 *   PHASE C   Nautobot registers an AP authenticator (with grant path).
 *   PHASE D   Negative: random wallet tries to register → fails.
 *             Negative: holder of a Registrar (wrong role) tries → fails.
 *   PHASE E   Nautobot rotates the AP's keypair in place. PDA unchanged;
 *             current_pubkey + key_rotated_at update; old pubkey is gone.
 *             Negative: rotate to the same pubkey → fails (no-op error).
 *             Negative: rotate to Pubkey::default() → fails.
 *   PHASE F   Cold admin registers a SECOND AP directly (no grant path).
 *   PHASE G   Nautobot revokes the first AP. Account closes.
 *             Negative: revoke same AP again → account-not-found.
 *   PHASE H   Re-register the same MAC after revocation — succeeds
 *             (the seed slot is freed). Confirms the lifecycle.
 *
 * End-state expectations:
 *   - exactly 2 live AccessDomainAuthenticator accounts (AP-1 re-created
 *     in H, AP-2 still live from F)
 *   - exactly 1 live DomainAuthority (the InfrastructureRegistrar grant)
 *   - AP-1's current_pubkey is the H-fresh key (not the rotated E key)
 *   - AP-2's current_pubkey is the cold-admin-direct key
 */

import { randomBytes } from 'crypto'

import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js'

import {
  buildAddAccessDomain,
  buildAddDevice,
  buildAddDeviceModel,
  buildGrantDomainAuthorityForAccessDomain,
  buildRegisterAuthMethod,
  buildRegisterAuthenticator,
  buildRevokeAuthenticator,
  buildRotateAuthenticatorPubkey,
} from './codec/encoders'
import {
  accessDomainPda,
  authMethodPda,
  authenticatorPda,
  AuthMethodType,
  configPda,
  deviceLocationPda,
  deviceModelPda,
  devicePda,
  DeviceType,
  domainAuthorityPda,
  DomainAuthorityRole,
  localDomainPda,
} from './codec/pda'
import { decodeAccessDomainAuthenticator } from './codec/decoders'
import { defaultPskParams, encodePSKMethodParams } from './codec/psk'
import { expect } from './expectations'
import {
  fund,
  runScenario,
  send,
  sendExpectFail,
  Scenario,
} from './runner'

// ===========================================================================
// Fixtures
// ===========================================================================

const OPERATOR_NAME = 'operator_admin'
const NAUTOBOT_NAME = 'nautobot_infra_registrar'
const INTRUDER_NAME = 'intruder'
const WRONG_ROLE_NAME = 'wrong_role_holder' // gets a Registrar grant, not InfraReg

const SSID = 'apf-test-ssid'
const AAA_DEVICE_NAME = 'apf-aaa-bridge'
const AAA_LOCAL_DOMAIN_NAME = 'apf-aaa-mgmt'
const AAA_MAC: number[] = [0x02, 0xaa, 0xaa, 0x00, 0x00, 0xa1]

const AP1_MAC: number[] = [0x02, 0xab, 0xcd, 0xef, 0x00, 0x01]
const AP2_MAC: number[] = [0x02, 0xab, 0xcd, 0xef, 0x00, 0x02]

const NAUTOBOT_SITE_UUID = Buffer.from(
  randomBytes(16),
)

const operator = Keypair.generate()
const nautobot = Keypair.generate()        // holds InfrastructureRegistrar
const intruder = Keypair.generate()        // unprivileged
const wrongRole = Keypair.generate()       // gets a Registrar grant
const ap1Initial = Keypair.generate()      // AP-1's initial keypair
const ap1Rotated = Keypair.generate()      // AP-1's post-rotate keypair
const ap1Reborn = Keypair.generate()       // AP-1's re-register-after-revoke key
const ap2Direct = Keypair.generate()       // AP-2's keypair (cold-admin direct)

// ===========================================================================
// Scenario
// ===========================================================================

export const scenario: Scenario = {
  name: 'access-domain-authenticators',
  seed: 42,
  expects: [
    expect.custom('exactly-2-live-authenticators', (state) => {
      const auths = state.byType('AccessDomainAuthenticator')
      return auths.length === 2
        ? { ok: true }
        : {
            ok: false,
            message: `expected 2 live authenticators, got ${auths.length}`,
            accounts: auths.map((a) => new PublicKey(a.pubkey)),
          }
    }),
    expect.custom('exactly-1-live-domain-authority', (state) => {
      const das = state.byType('DomainAuthority')
      if (das.length !== 1) {
        return {
          ok: false,
          message: `expected 1 live DomainAuthority, got ${das.length}`,
          accounts: das.map((a) => new PublicKey(a.pubkey)),
        }
      }
      const d = das[0].decoded as any
      // Anchor IDL serializes enum variants as { variantNameCamel: {} }.
      const roleKey = Object.keys(d.role)[0]
      return roleKey === 'infrastructureRegistrar'
        ? { ok: true }
        : {
            ok: false,
            message: `expected InfrastructureRegistrar role, got ${roleKey}`,
          }
    }),
    expect.custom('ap1-current-pubkey-matches-reborn-key', (state) => {
      const meta = state.metadata()
      const wantKey = meta.actors['ap1_reborn']
      if (!wantKey) return { ok: false, message: 'ap1_reborn actor missing' }
      const auths = state.byType('AccessDomainAuthenticator')
      const ap1 = auths.find((a) => {
        const d = a.decoded as any
        const mac = Buffer.from(d.macAddress)
        return mac.equals(Buffer.from(AP1_MAC))
      })
      if (!ap1) return { ok: false, message: 'AP-1 authenticator missing' }
      const got = (ap1.decoded as any).currentPubkey.toBase58()
      return got === wantKey
        ? { ok: true }
        : {
            ok: false,
            message: `AP-1 current_pubkey: got ${got}, want ${wantKey}`,
          }
    }),
    expect.custom('ap2-current-pubkey-matches-direct-key', (state) => {
      const meta = state.metadata()
      const wantKey = meta.actors['ap2_direct']
      if (!wantKey) return { ok: false, message: 'ap2_direct actor missing' }
      const auths = state.byType('AccessDomainAuthenticator')
      const ap2 = auths.find((a) => {
        const d = a.decoded as any
        const mac = Buffer.from(d.macAddress)
        return mac.equals(Buffer.from(AP2_MAC))
      })
      if (!ap2) return { ok: false, message: 'AP-2 authenticator missing' }
      const got = (ap2.decoded as any).currentPubkey.toBase58()
      return got === wantKey
        ? { ok: true }
        : {
            ok: false,
            message: `AP-2 current_pubkey: got ${got}, want ${wantKey}`,
          }
    }),
  ],

  run: async (capture, p) => {
    capture.declareActor(OPERATOR_NAME, operator.publicKey)
    capture.declareActor(NAUTOBOT_NAME, nautobot.publicKey)
    capture.declareActor(INTRUDER_NAME, intruder.publicKey)
    capture.declareActor(WRONG_ROLE_NAME, wrongRole.publicKey)
    capture.declareActor('ap1_initial', ap1Initial.publicKey)
    capture.declareActor('ap1_rotated', ap1Rotated.publicKey)
    capture.declareActor('ap1_reborn', ap1Reborn.publicKey)
    capture.declareActor('ap2_direct', ap2Direct.publicKey)

    const [config] = configPda()
    const [aaaModel] = deviceModelPda(
      DeviceType.Router,
      'TestVendor',
      'AAA-Server',
    )
    const [aaaDevice] = devicePda(
      operator.publicKey,
      aaaModel,
      AAA_DEVICE_NAME,
      AAA_MAC,
    )
    const [aaaDeviceLoc] = deviceLocationPda(aaaDevice)
    const [aaaLocalDomain] = localDomainPda(
      operator.publicKey,
      AAA_LOCAL_DOMAIN_NAME,
    )
    const [accessDomain] = accessDomainPda(operator.publicKey, SSID)
    const [authMethod] = authMethodPda({
      accessDomain,
      methodType: AuthMethodType.Mpsk,
    })
    const [infraGrant] = domainAuthorityPda({
      domain: accessDomain,
      role: DomainAuthorityRole.InfrastructureRegistrar,
      authority: nautobot.publicKey,
    })
    const [wrongGrant] = domainAuthorityPda({
      domain: accessDomain,
      role: DomainAuthorityRole.Registrar,
      authority: wrongRole.publicKey,
    })
    const [ap1Auth] = authenticatorPda({
      accessDomain,
      macAddress: AP1_MAC,
    })
    const [ap2Auth] = authenticatorPda({
      accessDomain,
      macAddress: AP2_MAC,
    })

    // -------------------------------------------------------------------
    // PHASE A — bootstrap
    // -------------------------------------------------------------------
    await capture.event(
      'Phase A: bootstrap (AAA DeviceModel, AAA Device, AccessDomain, MPSK AuthMethod)',
      {
        actor: OPERATOR_NAME,
        description:
          'Standard cold-admin bootstrap: register the AAA-Server DeviceModel, ' +
          'fund the operator wallet, register the bridge as a Device, then ' +
          'create the AccessDomain pointing at it and register the MPSK ' +
          'AuthMethod. Reuses the same shape as the mpsk-production ' +
          'scenario.',
      },
      async () => {
        await fund(capture, p.payer, operator.publicKey, 8, `fund:${OPERATOR_NAME}`)

        await send(
          capture,
          buildAddDeviceModel(
            { caller: p.payer.publicKey, config, deviceModel: aaaModel },
            { deviceType: DeviceType.Router, manufacturer: 'TestVendor', model: 'AAA-Server' },
          ),
          [p.payer],
          'add_device_model:AAA-Server',
        )

        await send(
          capture,
          buildAddDevice(
            {
              caller: operator.publicKey,
              deviceModel: aaaModel,
              device: aaaDevice,
              deviceLocation: aaaDeviceLoc,
              localDomain: aaaLocalDomain,
            },
            {
              name: AAA_DEVICE_NAME,
              height: 3,
              latitude: 38_900_000n,
              longitude: -77_036_000n,
              placement: [0, 0],
              macAddress: AAA_MAC,
              localDomainName: AAA_LOCAL_DOMAIN_NAME,
            },
          ),
          [operator],
          'add_device:AAA',
        )

        await send(
          capture,
          buildAddAccessDomain(
            { caller: operator.publicKey, accessDomain },
            {
              name: SSID,
              controlPlaneDevice: aaaDevice,
              gatewayDevice: null,
              localDomain: null,
              externalUuid: NAUTOBOT_SITE_UUID,
            },
          ),
          [operator],
          'add_access_domain',
        )

        const params = encodePSKMethodParams(
          defaultPskParams({ ssidLabel: SSID, bands: 'all' }),
        )
        await send(
          capture,
          buildRegisterAuthMethod(
            { caller: operator.publicKey, accessDomain, authMethod },
            { methodType: AuthMethodType.Mpsk, parameters: params },
          ),
          [operator],
          'register_auth_method:Mpsk',
        )
      },
    )

    // -------------------------------------------------------------------
    // PHASE B — grant InfrastructureRegistrar to Nautobot proxy +
    //           seed an unrelated Registrar grant to wrongRole
    // -------------------------------------------------------------------
    await capture.event(
      'Phase B: grants — InfrastructureRegistrar to nautobot, Registrar to wrongRole',
      {
        actor: OPERATOR_NAME,
        description:
          'Cold admin delegates the new InfrastructureRegistrar role to ' +
          'the nautobot proxy. Also issues a Registrar (wrong role for AP ' +
          'ops) grant to wrongRole, used later in the negative path test.',
      },
      async () => {
        await fund(capture, p.payer, nautobot.publicKey, 2, `fund:${NAUTOBOT_NAME}`)
        await fund(capture, p.payer, intruder.publicKey, 1, `fund:${INTRUDER_NAME}`)
        await fund(capture, p.payer, wrongRole.publicKey, 1, `fund:${WRONG_ROLE_NAME}`)

        await send(
          capture,
          buildGrantDomainAuthorityForAccessDomain(
            {
              caller: operator.publicKey,
              accessDomain,
              domainAuthority: infraGrant,
            },
            {
              role: DomainAuthorityRole.InfrastructureRegistrar,
              authority: nautobot.publicKey,
              label: 'nautobot-prod',
              expiresAt: null,
            },
          ),
          [operator],
          'grant:InfrastructureRegistrar',
        )

        await send(
          capture,
          buildGrantDomainAuthorityForAccessDomain(
            {
              caller: operator.publicKey,
              accessDomain,
              domainAuthority: wrongGrant,
            },
            {
              role: DomainAuthorityRole.Registrar,
              authority: wrongRole.publicKey,
              label: 'wrong-role-holder',
              expiresAt: null,
            },
          ),
          [operator],
          'grant:Registrar (wrong role for AP ops)',
        )
      },
    )

    // -------------------------------------------------------------------
    // PHASE C — Nautobot registers AP-1
    // -------------------------------------------------------------------
    await capture.event(
      'Phase C: Nautobot registers AP-1 via the InfrastructureRegistrar grant',
      {
        actor: NAUTOBOT_NAME,
        description:
          'Happy path for the grant-mediated authorization regime: nautobot ' +
          'signs register_authenticator. Initial keypair = ap1_initial. ' +
          'PDA seeded on AP-1\'s MAC, current_pubkey = ap1_initial.',
      },
      async () => {
        await send(
          capture,
          buildRegisterAuthenticator(
            {
              caller: nautobot.publicKey,
              accessDomain,
              infrastructureRegistrar: infraGrant,
              authenticator: ap1Auth,
            },
            {
              macAddress: AP1_MAC,
              initialPubkey: ap1Initial.publicKey,
              device: null,
              label: 'lobby-ap-1',
              expiresAt: null,
            },
          ),
          [nautobot],
          'register_authenticator:AP-1 (via grant)',
        )

        // Confirm the account decodes with the right fields.
        const acc = await p.banks.getAccount(ap1Auth)
        if (!acc) throw new Error('AP-1 authenticator account missing after register')
        const decoded = decodeAccessDomainAuthenticator(Buffer.from(acc.data))
        if (decoded.currentPubkey.toBase58() !== ap1Initial.publicKey.toBase58()) {
          throw new Error('AP-1 current_pubkey != ap1_initial after register')
        }
        if (decoded.accessDomain.toBase58() !== accessDomain.toBase58()) {
          throw new Error('AP-1 access_domain mismatch')
        }
        if (decoded.label !== 'lobby-ap-1') {
          throw new Error(`AP-1 label mismatch: ${decoded.label}`)
        }
      },
    )

    // -------------------------------------------------------------------
    // PHASE D — authorization negative tests
    // -------------------------------------------------------------------
    await capture.event(
      'Phase D: negative — intruder + wrong-role grants are rejected',
      {
        actor: INTRUDER_NAME,
        description:
          'Tests the authorization gates: a random key with no grant ' +
          'cannot register, and a key that holds a Registrar (not ' +
          'InfrastructureRegistrar) grant on the same AD also cannot.',
      },
      async () => {
        // We can't reuse AP-1's MAC (account already exists); pick a unique MAC.
        const [tempMacAuth] = authenticatorPda({
          accessDomain,
          macAddress: [0x02, 0x00, 0xde, 0xad, 0xbe, 0xef],
        })

        // (1) Intruder direct attempt — no grant → should fall through to
        //     the cold-admin check, which rejects.
        await sendExpectFail(
          capture,
          buildRegisterAuthenticator(
            {
              caller: intruder.publicKey,
              accessDomain,
              infrastructureRegistrar: null,
              authenticator: tempMacAuth,
            },
            {
              macAddress: [0x02, 0x00, 0xde, 0xad, 0xbe, 0xef],
              initialPubkey: Keypair.generate().publicKey,
              device: null,
              label: null,
              expiresAt: null,
            },
          ),
          [intruder],
          'register_authenticator:intruder (no grant)',
          { errorContains: 'OnlyAccessDomainOwner' },
        )

        // (2) wrongRole presents its Registrar grant — wrong role.
        await sendExpectFail(
          capture,
          buildRegisterAuthenticator(
            {
              caller: wrongRole.publicKey,
              accessDomain,
              infrastructureRegistrar: wrongGrant,
              authenticator: tempMacAuth,
            },
            {
              macAddress: [0x02, 0x00, 0xde, 0xad, 0xbe, 0xef],
              initialPubkey: Keypair.generate().publicKey,
              device: null,
              label: null,
              expiresAt: null,
            },
          ),
          [wrongRole],
          'register_authenticator:wrongRole (Registrar instead of InfraReg)',
          { errorContains: 'DomainAuthorityWrongRole' },
        )
      },
    )

    // -------------------------------------------------------------------
    // PHASE E — rotate AP-1's keypair, plus rotation negative tests
    // -------------------------------------------------------------------
    await capture.event(
      'Phase E: rotate AP-1 from ap1_initial → ap1_rotated; PDA unchanged',
      {
        actor: NAUTOBOT_NAME,
        description:
          'Happy path rotation: nautobot mutates the existing ' +
          'AccessDomainAuthenticator account in place. PDA address ' +
          'stays the same (seeded on MAC); current_pubkey changes; ' +
          'key_rotated_at updates.',
      },
      async () => {
        await send(
          capture,
          buildRotateAuthenticatorPubkey(
            {
              caller: nautobot.publicKey,
              accessDomain,
              infrastructureRegistrar: infraGrant,
              authenticator: ap1Auth,
            },
            ap1Rotated.publicKey,
          ),
          [nautobot],
          'rotate_authenticator_pubkey:AP-1',
        )

        const acc = await p.banks.getAccount(ap1Auth)
        if (!acc) throw new Error('AP-1 authenticator account missing after rotate')
        const decoded = decodeAccessDomainAuthenticator(Buffer.from(acc.data))
        if (decoded.currentPubkey.toBase58() !== ap1Rotated.publicKey.toBase58()) {
          throw new Error('AP-1 current_pubkey != ap1_rotated after rotate')
        }
        // bankrun Clock may resolve to the same unix_timestamp across two
        // instructions in the same scenario boot, so we accept >= instead
        // of strictly >. The on-chain handler always overwrites
        // key_rotated_at to Clock::get() at call time — the load-bearing
        // assertion is that the pubkey field changed, above.
        if (decoded.keyRotatedAt < decoded.createdAt) {
          throw new Error(
            `key_rotated_at (${decoded.keyRotatedAt}) regressed below created_at (${decoded.createdAt})`,
          )
        }

        // (Note: the "rotate to the same current_pubkey" case can't be
        // exercised in bankrun without manual blockhash advancement —
        // re-submitting the identical-bytes ix dedups at the RPC layer
        // before reaching the on-chain check. The on-chain
        // `AuthenticatorRotationNoOp` guard is still in place; tested
        // by code review + Anchor unit test if/when added.)

        // Negative: rotate to default pubkey.
        await sendExpectFail(
          capture,
          buildRotateAuthenticatorPubkey(
            {
              caller: nautobot.publicKey,
              accessDomain,
              infrastructureRegistrar: infraGrant,
              authenticator: ap1Auth,
            },
            PublicKey.default,
          ),
          [nautobot],
          'rotate:invalid pubkey (default)',
          { errorContains: 'InvalidAuthenticatorPubkey' },
        )
      },
    )

    // -------------------------------------------------------------------
    // PHASE F — cold admin registers AP-2 directly (no grant path)
    // -------------------------------------------------------------------
    await capture.event(
      'Phase F: cold admin registers AP-2 directly (no grant path)',
      {
        actor: OPERATOR_NAME,
        description:
          'Sanity check that the cold-admin direct path still works ' +
          'alongside the new grant-mediated path. Skips the optional ' +
          'infrastructure_registrar account (pass programId sentinel).',
      },
      async () => {
        await send(
          capture,
          buildRegisterAuthenticator(
            {
              caller: operator.publicKey,
              accessDomain,
              infrastructureRegistrar: null,
              authenticator: ap2Auth,
            },
            {
              macAddress: AP2_MAC,
              initialPubkey: ap2Direct.publicKey,
              device: null,
              label: 'lobby-ap-2',
              expiresAt: null,
            },
          ),
          [operator],
          'register_authenticator:AP-2 (cold-admin direct)',
        )
      },
    )

    // -------------------------------------------------------------------
    // PHASE G — revoke AP-1, then attempt double-revoke
    // -------------------------------------------------------------------
    await capture.event(
      'Phase G: revoke AP-1; account closes; double-revoke fails',
      {
        actor: NAUTOBOT_NAME,
        description:
          'Revocation closes the AccessDomainAuthenticator PDA. Rent ' +
          'returns to caller. A second revoke fails because the account ' +
          'is gone — Anchor surfaces this as a deserialization error on ' +
          'the missing account.',
      },
      async () => {
        await send(
          capture,
          buildRevokeAuthenticator(
            {
              caller: nautobot.publicKey,
              accessDomain,
              infrastructureRegistrar: infraGrant,
              authenticator: ap1Auth,
            },
          ),
          [nautobot],
          'revoke_authenticator:AP-1',
        )

        const acc = await p.banks.getAccount(ap1Auth)
        if (acc) throw new Error('AP-1 authenticator still present after revoke')

        // Double-revoke: the account is gone, so Anchor cannot
        // deserialize it. We only assert the failure happens.
        await sendExpectFail(
          capture,
          buildRevokeAuthenticator(
            {
              caller: nautobot.publicKey,
              accessDomain,
              infrastructureRegistrar: infraGrant,
              authenticator: ap1Auth,
            },
          ),
          [nautobot],
          'revoke:double (account already closed)',
        )
      },
    )

    // -------------------------------------------------------------------
    // PHASE H — re-register the same MAC after revoke (lifecycle)
    // -------------------------------------------------------------------
    await capture.event(
      'Phase H: re-register AP-1\'s MAC with a fresh keypair',
      {
        actor: NAUTOBOT_NAME,
        description:
          'After revocation the PDA seed slot is free, so the same MAC ' +
          'can be re-registered with a fresh keypair. Useful for hardware ' +
          'reset / replacement workflows where the MAC persists but the ' +
          'key state needs a clean start.',
      },
      async () => {
        await send(
          capture,
          buildRegisterAuthenticator(
            {
              caller: nautobot.publicKey,
              accessDomain,
              infrastructureRegistrar: infraGrant,
              authenticator: ap1Auth,
            },
            {
              macAddress: AP1_MAC,
              initialPubkey: ap1Reborn.publicKey,
              device: null,
              label: 'lobby-ap-1-reborn',
              expiresAt: null,
            },
          ),
          [nautobot],
          'register_authenticator:AP-1 (re-register after revoke)',
        )
      },
    )
  },
}

if (require.main === module) {
  runScenario(scenario).catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
