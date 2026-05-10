#!/usr/bin/env -S node_modules/.bin/ts-node --transpile-only

/**
 * Quick smoke test for the upgraded program's CredentialRegistered event.
 *
 * Steps:
 *   1. Reuse an existing AccessDomain we own (from the airport scenario).
 *   2. Mint one fresh credential via Registrar v4.
 *   3. Fetch the tx; locate the `Program data:` log line; decode body.
 *   4. Assert the body contains created_by == registrar_v4 pubkey.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js'

import { buildRegisterCredentialFor } from '../sim/codec/encoders'
import {
  accessDomainPda,
  authMethodPda,
  AuthMethodType,
  credentialPda,
  domainAuthorityPda,
  DomainAuthorityRole,
} from '../sim/codec/pda'
import { framePsk, sealForRecipient } from '../sim/codec/sealing'

const DEVNET_PROGRAM_ID = new PublicKey(
  'rHSumT63fgwAsHhKbR39AijjY28H99VuvM8xNaNehkj',
)
const BRIDGE_PUBKEY = new PublicKey(
  '2tXxypDNQbJU6wqxodttDbvSZN2Nebuzypps1huH3ZsF',
)

async function main() {
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed')
  const operator = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/solana/id.json'), 'utf8'))),
  )

  // Reuse the airport-scenario TerminalA AccessDomain.
  const ssid = 'TerminalA-381729'
  const [accessDomain] = accessDomainPda(operator.publicKey, ssid, DEVNET_PROGRAM_ID)
  const [authMethod] = authMethodPda(
    { accessDomain, methodType: AuthMethodType.Mpsk },
    DEVNET_PROGRAM_ID,
  )

  // The active registrar from that scenario was v4. Its grant PDA is computable
  // from its pubkey, but we need to actually have its keypair to sign — which
  // we don't (it was ephemeral). So instead we'll mint via direct path: the
  // operator mints with `registrar: null`, becoming the caller, which on-chain
  // checks `caller == access_domain.owner`.
  const beneficiary = Keypair.generate()
  const [credPda] = credentialPda(
    { accessDomain, authMethod, authority: beneficiary.publicKey },
    DEVNET_PROGRAM_ID,
  )

  console.log('Submitting register_credential_for via direct (operator-signed) path:')
  console.log('  beneficiary:    ', beneficiary.publicKey.toBase58())
  console.log('  credential PDA: ', credPda.toBase58())

  const sealed = sealForRecipient(BRIDGE_PUBKEY, framePsk('smoke-new-fields-2026'))
  const ix = buildRegisterCredentialFor(
    {
      caller: operator.publicKey,
      beneficiary: beneficiary.publicKey,
      accessDomain,
      authMethod,
      registrar: null, // direct path — caller must equal access_domain.owner
      credential: credPda,
    },
    { vlanId: 99, qosTag: 7, sealedPayload: sealed },
    DEVNET_PROGRAM_ID,
  )
  const tx = new Transaction().add(ix)
  tx.feePayer = operator.publicKey
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed')
  tx.recentBlockhash = blockhash
  tx.sign(operator)
  const sig = await conn.sendRawTransaction(tx.serialize(), { preflightCommitment: 'confirmed' })
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
  console.log('  signature:      ', sig)

  // Fetch the tx logs.
  const fetched = await conn.getTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  })
  if (!fetched || !fetched.meta?.logMessages) {
    throw new Error('tx logs missing')
  }
  const dataLines = fetched.meta.logMessages.filter((l) => l.startsWith('Program data: '))
  console.log()
  console.log(`Found ${dataLines.length} Program data: line(s):`)
  for (const line of dataLines) {
    const body = Buffer.from(line.slice('Program data: '.length), 'base64')
    const disc = body.subarray(0, 8).toString('hex')
    console.log(`  disc=${disc} body_len=${body.length}`)

    // CredentialRegistered discriminator = 14de86a13fd1d37d
    if (disc === '14de86a13fd1d37d') {
      const b = body.subarray(8)
      // Decode in declaration order (post-upgrade):
      //   credential(32) authority(32) access_domain(32) auth_method(32)
      //   Option<u16> vlan_id (1+2) Option<u8> qos_tag (1+1)
      //   created_by(32) created_at(8)
      let o = 0
      const credential = new PublicKey(b.subarray(o, o + 32)); o += 32
      const authority = new PublicKey(b.subarray(o, o + 32));  o += 32
      const accessDom = new PublicKey(b.subarray(o, o + 32));  o += 32
      const authMeth = new PublicKey(b.subarray(o, o + 32));   o += 32
      const vlanTag = b.readUInt8(o); o += 1
      const vlanId = vlanTag === 1 ? b.readUInt16LE(o) : null
      o += vlanTag === 1 ? 2 : 0
      const qosTag = b.readUInt8(o); o += 1
      const qos = qosTag === 1 ? b.readUInt8(o) : null
      o += qosTag === 1 ? 1 : 0
      const createdBy = new PublicKey(b.subarray(o, o + 32)); o += 32
      const createdAt = b.readBigInt64LE(o); o += 8

      console.log()
      console.log('  === CredentialRegistered (decoded) ===')
      console.log('    credential:    ', credential.toBase58())
      console.log('    authority:     ', authority.toBase58())
      console.log('    access_domain: ', accessDom.toBase58())
      console.log('    auth_method:   ', authMeth.toBase58())
      console.log('    vlan_id:       ', vlanId)
      console.log('    qos_tag:       ', qos)
      console.log('    created_by:    ', createdBy.toBase58(), '   ← NEW FIELD')
      console.log('    created_at:    ', createdAt.toString())
      console.log('    body bytes consumed: ', o, ' (expected 144)')

      const ok = createdBy.equals(operator.publicKey)
      console.log()
      console.log(ok
        ? '  [PASS] created_by == operator pubkey ✓'
        : `  [FAIL] created_by=${createdBy.toBase58()} != operator=${operator.publicKey.toBase58()}`)
      process.exit(ok ? 0 : 1)
    }
  }
  throw new Error('CredentialRegistered event not found in tx logs')
}

main().catch((err) => {
  console.error('smoke threw:', err)
  process.exit(1)
})
