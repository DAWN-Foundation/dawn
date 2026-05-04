/**
 * Bootstrap milestone.
 *
 * Drives the protocol's one-time bootstrap sequence end-to-end:
 *   init_token  →  init_fee_accounts  →  initialize_config
 *
 * Then reads back the Config + TokenConfig accounts and verifies the
 * decoded state matches what we sent in. This validates:
 *
 *   1. The codec layer (instruction discriminators + arg encoding +
 *      account ordering) produces transactions the program accepts.
 *   2. The PDA derivations match the program's seeds.
 *   3. The decoders correctly read back account state.
 *
 * Once green, every additional instruction is just a new encoder
 * following the same pattern.
 */

import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { startAnchor, BanksClient, ProgramTestContext } from 'solana-bankrun'
import {
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
} from '@solana/spl-token'

import {
  DAWN_PROGRAM_ID,
  RAYDIUM_PROGRAM_ID,
  METADATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from './codec/program'
import {
  buildInitFeeAccounts,
  buildInitToken,
  buildInitializeConfig,
} from './codec/encoders'
import { decodeConfig, decodeTokenConfig } from './codec/decoders'
import {
  configPda,
  daoDawnAccountPda,
  dawnMintPda,
  feePoolDawnAccountPda,
  medallionDawnAccountPda,
  tokenConfigPda,
  validatorDawnAccountPda,
} from './codec/pda'

function check(name: string, ok: boolean, detail?: string) {
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

async function send(
  ctx: ProgramTestContext,
  ix: TransactionInstruction,
  signers: Keypair[],
  label: string,
) {
  const tx = new Transaction()
  tx.feePayer = signers[0].publicKey
  tx.recentBlockhash = (await ctx.banksClient.getLatestBlockhash())[0]
  tx.add(ix)
  tx.sign(...signers)
  const meta = await ctx.banksClient.tryProcessTransaction(tx)
  if (meta.result) {
    console.log(`[FAIL] ${label} — ${meta.result}`)
    if (meta.meta?.logMessages) {
      for (const log of meta.meta.logMessages) console.log(`         ${log}`)
    }
    process.exitCode = 1
    throw new Error(`${label} failed`)
  }
  const cu = meta.meta?.computeUnitsConsumed
  console.log(`[PASS] ${label}${cu ? ` — ${cu} CU` : ''}`)
}

async function main() {
  console.log('--- bootstrap milestone ---')

  const ctx = await startAnchor(
    '.',
    [
      { name: 'dawn', programId: DAWN_PROGRAM_ID },
      { name: 'raydium', programId: RAYDIUM_PROGRAM_ID },
      { name: 'meta', programId: METADATA_PROGRAM_ID },
    ],
    [],
  )
  const banks: BanksClient = ctx.banksClient
  const payer = ctx.payer
  console.log(`payer:                ${payer.publicKey.toBase58()}`)

  // -----------------------------------------------------------------------
  // 1. Create a USD.tel mint (initialize_config requires a real Mint).
  //    Done via raw SystemProgram.createAccount + InitializeMint2 over
  //    banksClient — no spl-token-bankrun helper.
  // -----------------------------------------------------------------------
  const stableMintKp = Keypair.generate()
  const stableMint = stableMintKp.publicKey
  const rent = await banks.getRent()
  const mintLamports = Number(await rent.minimumBalance(BigInt(MINT_SIZE)))
  {
    const tx = new Transaction()
    tx.feePayer = payer.publicKey
    tx.recentBlockhash = (await banks.getLatestBlockhash())[0]
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: stableMint,
        space: MINT_SIZE,
        lamports: mintLamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        stableMint,
        6,
        payer.publicKey,
        null,
      ),
    )
    tx.sign(payer, stableMintKp)
    const m = await banks.tryProcessTransaction(tx)
    if (m.result) throw new Error(`stable mint create failed: ${m.result}`)
  }
  console.log(`stable mint (USD.tel):${stableMint.toBase58()}`)

  // -----------------------------------------------------------------------
  // 2. init_token
  // -----------------------------------------------------------------------
  const [tokenConfig] = tokenConfigPda()
  const [dawnMint] = dawnMintPda()
  const callerDawnAta = getAssociatedTokenAddressSync(dawnMint, payer.publicKey)

  await send(
    ctx,
    buildInitToken({
      caller: payer.publicKey,
      tokenConfig,
      dawnMint,
      callerDawnAccount: callerDawnAta,
    }),
    [payer],
    'init_token',
  )

  // Verify TokenConfig was created and fields match.
  const tcAcc = await banks.getAccount(tokenConfig)
  check('TokenConfig account exists', tcAcc != null)
  if (tcAcc) {
    const tc = decodeTokenConfig(Buffer.from(tcAcc.data))
    check(
      'TokenConfig.dawn_mint == dawn PDA',
      tc.dawnMint.equals(dawnMint),
      tc.dawnMint.toBase58(),
    )
    check('TokenConfig.created_at > 0', tc.createdAt > 0n, `${tc.createdAt}`)
  }

  // Verify DAWN mint exists.
  const dawnMintAcc = await banks.getAccount(dawnMint)
  check(
    'DAWN mint account exists and is owned by SPL Token program',
    dawnMintAcc != null && new PublicKey(dawnMintAcc.owner).equals(TOKEN_PROGRAM_ID),
  )

  // -----------------------------------------------------------------------
  // 3. init_fee_accounts
  // -----------------------------------------------------------------------
  const [feePool] = feePoolDawnAccountPda()
  const [dao] = daoDawnAccountPda()
  const [validator] = validatorDawnAccountPda()
  const [medallion] = medallionDawnAccountPda()

  await send(
    ctx,
    buildInitFeeAccounts({
      caller: payer.publicKey,
      tokenConfig,
      dawnMint,
      feePoolDawnAccount: feePool,
      daoDawnAccount: dao,
      validatorDawnAccount: validator,
      medallionDawnAccount: medallion,
    }),
    [payer],
    'init_fee_accounts',
  )

  for (const [label, key] of [
    ['fee_pool', feePool],
    ['dao', dao],
    ['validator', validator],
    ['medallion', medallion],
  ] as const) {
    const acc = await banks.getAccount(key)
    check(
      `${label} fee account exists and is SPL Token-owned`,
      acc != null && new PublicKey(acc.owner).equals(TOKEN_PROGRAM_ID),
    )
  }

  // -----------------------------------------------------------------------
  // 4. initialize_config
  // -----------------------------------------------------------------------
  const [config] = configPda()
  const apiAuthority = Keypair.generate().publicKey
  const raydiumPlaceholders = {
    raydium: Keypair.generate().publicKey,
    raydiumAuthority: Keypair.generate().publicKey,
    raydiumConfig: Keypair.generate().publicKey,
    raydiumPool: Keypair.generate().publicKey,
    raydiumObservation: Keypair.generate().publicKey,
  }

  await send(
    ctx,
    buildInitializeConfig(
      {
        caller: payer.publicKey,
        apiAuthority,
        config,
        tokenConfig,
        stableMint,
        dawnMint,
        feePoolDawnAccount: feePool,
        daoDawnAccount: dao,
        validatorDawnAccount: validator,
        medallionDawnAccount: medallion,
        ...raydiumPlaceholders,
      },
      {
        daoFee: 300n,        // 3%
        validatorFee: 300n,  // 3%
        medallionFee: 900n,  // 9%
      },
    ),
    [payer],
    'initialize_config',
  )

  // Verify Config was created and every field round-trips.
  const cfgAcc = await banks.getAccount(config)
  check('Config account exists', cfgAcc != null)
  if (cfgAcc) {
    const cfg = decodeConfig(Buffer.from(cfgAcc.data))
    check('Config.authority == payer', cfg.authority.equals(payer.publicKey))
    check('Config.api_authority round-trips', cfg.apiAuthority.equals(apiAuthority))
    check('Config.token_config == tokenConfig PDA', cfg.tokenConfig.equals(tokenConfig))
    check('Config.dawn_mint == dawn PDA', cfg.dawnMint.equals(dawnMint))
    check('Config.stable_mint round-trips', cfg.stableMint.equals(stableMint))
    check('Config.dao_fee == 300', cfg.daoFee === 300n, `${cfg.daoFee}`)
    check('Config.validator_fee == 300', cfg.validatorFee === 300n, `${cfg.validatorFee}`)
    check('Config.medallion_fee == 900', cfg.medallionFee === 900n, `${cfg.medallionFee}`)
    check(
      'Config.raydium_pool round-trips (placeholder)',
      cfg.raydiumPool.equals(raydiumPlaceholders.raydiumPool),
    )
    check('Config.bump > 0', cfg.bump > 0, `bump=${cfg.bump}`)
  }

  console.log('--- bootstrap milestone complete ---')
}

main().catch((err) => {
  console.error('bootstrap threw:', err)
  process.exit(1)
})
