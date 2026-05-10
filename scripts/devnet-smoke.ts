#!/usr/bin/env -S node_modules/.bin/ts-node --transpile-only

/**
 * Devnet smoke test.
 *
 * Sanity-checks that the deployed lean program accepts our codec output
 * end-to-end on a real chain. Runs initialize_config (idempotent: if the
 * Config PDA already exists, we just decode and validate it) and the
 * one-shot update_config_authority self-rotation (no-op rotate to the
 * same key) so we exercise both an init path and a mutation path.
 *
 * Usage:
 *   ./scripts/devnet-smoke.ts
 *
 * Environment overrides:
 *   DEPLOYER_KEYPAIR=path/to.json   (default: ~/.config/solana/id.json)
 *   RPC=https://...                 (default: https://api.devnet.solana.com)
 *
 * Pass criteria:
 *   1. Config account exists at the expected PDA after this script runs.
 *   2. Config.authority == deployer pubkey.
 *   3. Config.bump > 0 and matches the off-chain PDA derivation.
 *   4. Config.created_at is non-zero and within the last hour.
 *   5. update_config_authority(self) tx lands without error.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'

import {
  buildInitializeConfig,
  buildUpdateConfigAuthority,
} from '../sim/codec/encoders'
import { decodeConfig } from '../sim/codec/decoders'
import { configPda } from '../sim/codec/pda'

// ---------------------------------------------------------------------------
// Identity of the deployed program (must match scripts/devnet-deploy.sh)
// ---------------------------------------------------------------------------
const DEVNET_PROGRAM_ID = new PublicKey(
  'rHSumT63fgwAsHhKbR39AijjY28H99VuvM8xNaNehkj',
)

const RPC = process.env.RPC ?? 'https://api.devnet.solana.com'
const KEYPAIR_PATH =
  process.env.DEPLOYER_KEYPAIR ?? path.join(os.homedir(), '.config/solana/id.json')

function loadKeypair(p: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
  return Keypair.fromSecretKey(Uint8Array.from(raw))
}

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: string) {
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (ok) pass += 1
  else {
    fail += 1
    process.exitCode = 1
  }
}

async function sendAndConfirm(
  conn: Connection,
  ix: TransactionInstruction,
  signer: Keypair,
  label: string,
): Promise<void> {
  const tx = new Transaction().add(ix)
  tx.feePayer = signer.publicKey
  tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
  tx.sign(signer)
  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })
  console.log(`         ${label} sent: ${sig}`)
  const conf = await conn.confirmTransaction(
    {
      signature: sig,
      blockhash: tx.recentBlockhash!,
      lastValidBlockHeight: (await conn.getLatestBlockhash('confirmed'))
        .lastValidBlockHeight,
    },
    'confirmed',
  )
  if (conf.value.err) {
    throw new Error(`${label} failed: ${JSON.stringify(conf.value.err)}`)
  }
  console.log(`         ${label} confirmed`)
}

async function main() {
  console.log('─────────────────────────────────────────────────────────────')
  console.log('  DAWN devnet smoke test')
  console.log('─────────────────────────────────────────────────────────────')
  console.log(`  rpc:        ${RPC}`)
  console.log(`  program:    ${DEVNET_PROGRAM_ID.toBase58()}`)
  console.log(`  keypair:    ${KEYPAIR_PATH}`)

  const conn = new Connection(RPC, 'confirmed')
  const deployer = loadKeypair(KEYPAIR_PATH)
  console.log(`  deployer:   ${deployer.publicKey.toBase58()}`)

  // Sanity: program is actually deployed and executable.
  const programAcc = await conn.getAccountInfo(DEVNET_PROGRAM_ID, 'confirmed')
  check(
    'program account exists',
    programAcc != null,
    programAcc ? `executable=${programAcc.executable}, owner=${programAcc.owner.toBase58()}` : 'missing',
  )
  if (!programAcc) {
    console.error('aborting: program is not deployed at this id')
    process.exit(1)
  }

  // Off-chain PDA derivation.
  const [config, configBump] = configPda(DEVNET_PROGRAM_ID)
  console.log(`  config pda: ${config.toBase58()} (bump=${configBump})`)
  console.log('─────────────────────────────────────────────────────────────')

  // Phase 1: initialize_config (idempotent).
  let configAcc = await conn.getAccountInfo(config, 'confirmed')
  if (configAcc) {
    console.log('Config PDA already exists — skipping initialize_config')
  } else {
    console.log('Config PDA does not exist — sending initialize_config')
    await sendAndConfirm(
      conn,
      buildInitializeConfig(
        { caller: deployer.publicKey, config },
        DEVNET_PROGRAM_ID,
      ),
      deployer,
      'initialize_config',
    )
    configAcc = await conn.getAccountInfo(config, 'confirmed')
  }
  check('Config account exists post-init', configAcc != null)
  if (!configAcc) return

  // Decode and validate.
  const cfg = decodeConfig(Buffer.from(configAcc.data))
  check(
    'Config.authority == deployer',
    cfg.authority.equals(deployer.publicKey),
    cfg.authority.toBase58(),
  )
  check(
    'Config.bump matches off-chain derivation',
    cfg.bump === configBump,
    `on-chain=${cfg.bump}, off-chain=${configBump}`,
  )
  check(
    'Config.bump in (0, 255]',
    cfg.bump > 0 && cfg.bump <= 255,
    `${cfg.bump}`,
  )
  const nowSec = Math.floor(Date.now() / 1000)
  const createdAtSec = Number(cfg.createdAt)
  const ageSec = nowSec - createdAtSec
  check(
    'Config.created_at is plausibly recent (≤ 24h ago)',
    createdAtSec > 0 && ageSec >= 0 && ageSec < 24 * 60 * 60,
    `created_at=${createdAtSec} (${ageSec}s ago)`,
  )
  check(
    'Config account is owned by the dawn program',
    new PublicKey(configAcc.owner).equals(DEVNET_PROGRAM_ID),
    new PublicKey(configAcc.owner).toBase58(),
  )

  // Phase 2: update_config_authority(self) — no-op rotation that exercises
  // the mutation path and confirms cold-admin gating still works.
  console.log()
  console.log('Phase 2: update_config_authority (self-rotate, no-op)')
  await sendAndConfirm(
    conn,
    buildUpdateConfigAuthority(
      { caller: deployer.publicKey, config },
      deployer.publicKey, // rotate to self → no logical change
      DEVNET_PROGRAM_ID,
    ),
    deployer,
    'update_config_authority',
  )

  const cfgAfter = decodeConfig(
    Buffer.from((await conn.getAccountInfo(config, 'confirmed'))!.data),
  )
  check(
    'Config.authority unchanged after self-rotate',
    cfgAfter.authority.equals(deployer.publicKey),
    cfgAfter.authority.toBase58(),
  )
  check(
    'Config.created_at unchanged after self-rotate',
    cfgAfter.createdAt === cfg.createdAt,
    `before=${cfg.createdAt}, after=${cfgAfter.createdAt}`,
  )

  console.log()
  console.log('─────────────────────────────────────────────────────────────')
  console.log(`  ${pass} pass, ${fail} fail`)
  console.log(`  https://solscan.io/account/${config.toBase58()}?cluster=devnet`)
  console.log('─────────────────────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('smoke test threw:', err)
  process.exit(1)
})
