import { Keypair, PublicKey } from '@solana/web3.js'
import { Program, Wallet, BN, Idl } from '@coral-xyz/anchor'
import { ASSOCIATED_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'

import { RaydiumCpSwap } from '../../../raydium/raydium_cp_swap'

import {
  getAuthAddress,
  getPoolAddress,
  getPoolLpMintAddress,
  getPoolVaultAddress,
} from './pda'

export async function deposit(
  program: Program,
  wallet: Keypair,
  configPda: PublicKey,
  mint0: PublicKey,
  mint1: PublicKey,
  userMint0: PublicKey,
  userMint1: PublicKey,
  dawnIsBase: boolean,
) {
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

  // 10 LP tokens were minted when the pool was created
  const lp_token_amount = new BN(10000000000)

  // deposit more of each token
  const dawn_amount = new BN(100_000_000_000)
  const stable_amount = new BN(200_000_000_000)
  const maximum_token_0_amount = dawnIsBase ? dawn_amount : stable_amount
  const maximum_token_1_amount = dawnIsBase ? stable_amount : dawn_amount

  await program.methods
    .deposit(lp_token_amount, maximum_token_0_amount, maximum_token_1_amount)
    .accounts({
      owner: wallet.publicKey,
      authority: auth,
      poolState: pool,
      ownerLpToken: creatorLpTokenAddress,
      token0Account: userMint0,
      token1Account: userMint1,
      token0Vault: vault0,
      token1Vault: vault1,
      vault0Mint: mint0,
      vault1Mint: mint1,
      lpMint: lpMintAddress,
      // programs
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
    })
    .rpc({ commitment: 'finalized' })

  console.log('Successfully deposited more liquidity')
}
