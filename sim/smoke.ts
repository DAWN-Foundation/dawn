/**
 * Bankrun smoke test.
 *
 * Goal: prove the in-process Solana VM (solana-bankrun) can load dawn.so
 * along with the Raydium and Metaplex Metadata fixtures, produce a
 * blockhash, and process a transaction. This is the foundation the
 * agent-driven simulator will build on.
 *
 * No IDL, no anchor TS types, no project SDK imports. Pure raw runtime.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import { startAnchor } from 'solana-bankrun'

const DAWN_PROGRAM_ID = new PublicKey(
  '4yBWXvJ2otyMvkBewgKhnkJ7WP1c7HHDSicdQwH4dXqC',
)
const RAYDIUM_PROGRAM_ID = new PublicKey(
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
)
const METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
)

function loadLocalWallet(): Keypair {
  const p = path.join(os.homedir(), '.config', 'solana', 'id.json')
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(p, 'utf8')))
  return Keypair.fromSecretKey(secret)
}

function check(name: string, condition: boolean, detail?: string) {
  const tag = condition ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (!condition) process.exitCode = 1
}

async function main() {
  console.log('--- bankrun smoke test ---')

  // 1. Boot bankrun with dawn + raydium + metadata programs.
  //    startAnchor reads target/deploy/{name}.so and tests/fixtures/{name}.so
  //    in the cwd; we run from project root.
  const ctx = await startAnchor(
    '.',
    [
      { name: 'dawn', programId: DAWN_PROGRAM_ID },
      { name: 'raydium', programId: RAYDIUM_PROGRAM_ID },
      { name: 'meta', programId: METADATA_PROGRAM_ID },
    ],
    [],
  )
  check('startAnchor returned a context', ctx != null)

  const banks = ctx.banksClient
  const payer: Keypair = ctx.payer
  console.log(`payer: ${payer.publicKey.toBase58()}`)

  // 2. Blockhash retrieval — proves the bank is alive.
  const [blockhash] = await banks.getLatestBlockhash()
  check('latest blockhash retrievable', !!blockhash)

  // 3. Verify dawn.so was loaded into the program cache.
  const dawnAcc = await banks.getAccount(DAWN_PROGRAM_ID)
  check(
    'dawn program account present',
    dawnAcc != null && dawnAcc.executable === true,
    dawnAcc ? `owner=${new PublicKey(dawnAcc.owner).toBase58()} executable=${dawnAcc.executable}` : 'missing',
  )
  const raydiumAcc = await banks.getAccount(RAYDIUM_PROGRAM_ID)
  check(
    'raydium fixture program present',
    raydiumAcc != null && raydiumAcc.executable === true,
  )
  const metaAcc = await banks.getAccount(METADATA_PROGRAM_ID)
  check(
    'metadata fixture program present',
    metaAcc != null && metaAcc.executable === true,
  )

  // 4. Process a system transfer to a fresh keypair.
  const recipient = Keypair.generate()
  const transferAmount = 0.5 * LAMPORTS_PER_SOL
  const tx = new Transaction({
    feePayer: payer.publicKey,
    blockhash,
    lastValidBlockHeight: Number((await banks.getLatestBlockhash())[1]),
  }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient.publicKey,
      lamports: transferAmount,
    }),
  )
  tx.sign(payer)
  const meta = await banks.processTransaction(tx)
  check(
    'system transfer processed without error',
    meta.result == null,
    meta.result ? `result=${meta.result}` : 'ok',
  )

  const recipientBalance = await banks.getBalance(recipient.publicKey)
  check(
    'recipient balance reflects transfer',
    Number(recipientBalance) === transferAmount,
    `${recipientBalance} lamports`,
  )

  // 5. Send a deliberately-malformed instruction to dawn — we want to
  //    confirm the program processes (and rejects) it, proving it is
  //    actually running inside the BPF VM. An empty instruction data
  //    has no discriminator, so the program returns an error.
  const blockhash2 = (await banks.getLatestBlockhash())[0]
  const probeTx = new Transaction({
    feePayer: payer.publicKey,
    blockhash: blockhash2,
    lastValidBlockHeight: Number((await banks.getLatestBlockhash())[1]),
  }).add(
    new TransactionInstruction({
      programId: DAWN_PROGRAM_ID,
      keys: [],
      data: Buffer.alloc(0),
    }),
  )
  probeTx.sign(payer)
  const probeMeta = await banks.tryProcessTransaction(probeTx)
  check(
    'dawn program executed and returned an error (proves load + dispatch)',
    probeMeta.result != null,
    probeMeta.result ? `expected-error: ${probeMeta.result}` : 'unexpectedly succeeded',
  )

  // 6. Show the clock.
  const clock = await banks.getClock()
  check('clock readable', clock.unixTimestamp >= 0n, `unix=${clock.unixTimestamp}, slot=${clock.slot}`)

  console.log('--- smoke test complete ---')
}

main().catch((err) => {
  console.error('smoke test threw:', err)
  process.exit(1)
})
