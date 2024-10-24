import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { Program, Wallet, BN } from '@coral-xyz/anchor'
import { ASSOCIATED_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

import { RaydiumCpSwap } from '../../raydium/raydium_cp_swap'

import {
  getAuthAddress,
  getOrcleAccountAddress,
  getPoolAddress,
  getPoolLpMintAddress,
  getPoolVaultAddress,
} from './pda'

export async function createPool(
  program: Program<RaydiumCpSwap>,
  wallet: Wallet,
  configPda: PublicKey,
  mint0: PublicKey,
  mint1: PublicKey,
  userMint0: PublicKey,
  userMint1: PublicKey,
) {
  const mint0Amount = new BN(10_000_000_000)
  const mint1Amount = new BN(10_000_000_000)

  const createPoolFee = new PublicKey(
    'DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8',
  )

  const [auth] = getAuthAddress(program.programId)

  console.log({ auth: auth.toBase58() })

  const [poolPda] = getPoolAddress(configPda, mint0, mint1, program.programId)
  const [lpMintAddress] = getPoolLpMintAddress(poolPda, program.programId)
  const [vault0] = getPoolVaultAddress(poolPda, mint0, program.programId)
  const [vault1] = getPoolVaultAddress(poolPda, mint1, program.programId)
  const [creatorLpTokenAddress] = PublicKey.findProgramAddressSync(
    [
      wallet.publicKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      lpMintAddress.toBuffer(),
    ],
    ASSOCIATED_PROGRAM_ID,
  )
  const [observationAddress] = getOrcleAccountAddress(
    poolPda,
    program.programId,
  )

  await program.methods
    .initialize(mint0Amount, mint1Amount, new BN(0))
    .accounts({
      creator: wallet.publicKey,
      ammConfig: configPda,
      authority: auth,
      poolState: poolPda,
      token0Mint: mint0,
      token1Mint: mint1,
      lpMint: lpMintAddress,
      creatorToken0: userMint0,
      creatorToken1: userMint1,
      creatorLpToken: creatorLpTokenAddress,
      token0Vault: vault0,
      token1Vault: vault1,
      createPoolFee,
      observationState: observationAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
      token0Program: TOKEN_PROGRAM_ID,
      token1Program: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc()

  console.log({
    poolPda: poolPda.toBase58(),
    vault0: vault0.toBase58(),
    vault1: vault1.toBase58(),
  })

  return poolPda
}
