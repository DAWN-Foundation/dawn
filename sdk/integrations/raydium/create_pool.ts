import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js'
import { Program, Wallet, BN } from '@coral-xyz/anchor'
import { ASSOCIATED_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

import { RaydiumCpSwap } from '../../../raydium/raydium_cp_swap'

import {
  getAuthAddress,
  getOrcleAccountAddress,
  getPoolAddress,
  getPoolLpMintAddress,
  getPoolVaultAddress,
} from './pda'
import { RAYDIUM_POOL_FEE_RECEIVER } from '.'

export async function createPool(
  program: Program,
  wallet: Keypair,
  configPda: PublicKey,
  mint0: PublicKey,
  mint1: PublicKey,
  userMint0: PublicKey,
  userMint1: PublicKey,
  dawnIsBase: boolean,
) {
  // initial price 2 USDC per 1 DAWN
  const dawnAmount = new BN(100_000_000_000)
  const usdcAmount = new BN(200_000_000_000)

  const mint0Amount = dawnIsBase ? dawnAmount : usdcAmount
  const mint1Amount = dawnIsBase ? usdcAmount : dawnAmount

  const [auth] = getAuthAddress(program.programId)
  const [pool] = getPoolAddress(configPda, mint0, mint1, program.programId)
  const [lpMintAddress] = getPoolLpMintAddress(pool, program.programId)
  const [vault0] = getPoolVaultAddress(pool, mint0, program.programId)
  const [vault1] = getPoolVaultAddress(pool, mint1, program.programId)
  const [creatorLpTokenAddress] = PublicKey.findProgramAddressSync(
    [
      wallet.publicKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      lpMintAddress.toBuffer(),
    ],
    ASSOCIATED_PROGRAM_ID,
  )
  const [obs] = getOrcleAccountAddress(pool, program.programId)

  await program.methods
    .initialize(mint0Amount, mint1Amount, new BN(0))
    .accounts({
      creator: wallet.publicKey,
      ammConfig: configPda,
      authority: auth,
      poolState: pool,
      token0Mint: mint0,
      token1Mint: mint1,
      lpMint: lpMintAddress,
      creatorToken0: userMint0,
      creatorToken1: userMint1,
      creatorLpToken: creatorLpTokenAddress,
      token0Vault: vault0,
      token1Vault: vault1,
      createPoolFee: RAYDIUM_POOL_FEE_RECEIVER,
      observationState: obs,
      tokenProgram: TOKEN_PROGRAM_ID,
      token0Program: TOKEN_PROGRAM_ID,
      token1Program: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc()

  console.log({
    pool: pool.toBase58(),
    authority: auth.toBase58(),
    vault0: vault0.toBase58(),
    vault1: vault1.toBase58(),
  })

  return { pool, auth, obs }
}
