import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { getRaydiumProgram, OBSERVATION_SEED, POOL_VAULT_SEED } from '.'

const POSITION_SEED = 'position_seed'

export async function addLiquidity(
  provider: anchor.AnchorProvider,
  raydiumProgramId: PublicKey,
  config: PublicKey,
  pool: PublicKey,
  dawnMint: PublicKey,
  usdcMint: PublicKey,
  nftOwner: anchor.web3.Keypair, // The signer who owns the NFT
  liquidity: BN = new BN(1_000_000), // Default liquidity amount
  amount0Max: BN = new BN(500_000), // Default max token 0
  amount1Max: BN = new BN(300_000), // Default max token 1
  baseFlag: boolean | null = null, // Optional base flag
) {
  const program = getRaydiumProgram(provider)

  // Derive the NFT-associated token account (nft_account)
  const nftAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    nftOwner,
    dawnMint,
    nftOwner.publicKey,
  )

  // Derive Personal Position PDA
  const [personalPositionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POSITION_SEED), pool.toBuffer()],
    raydiumProgramId,
  )

  // Derive Protocol Position PDA
  const [protocolPositionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POSITION_SEED), pool.toBuffer()],
    raydiumProgramId,
  )

  // Derive token vault PDAs
  const [tokenVault0Pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_VAULT_SEED), pool.toBuffer(), dawnMint.toBuffer()],
    raydiumProgramId,
  )

  const [tokenVault1Pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_VAULT_SEED), pool.toBuffer(), usdcMint.toBuffer()],
    raydiumProgramId,
  )

  // Derive tick arrays (tick_array_lower and tick_array_upper)
  const [tickArrayLowerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(OBSERVATION_SEED), pool.toBuffer()],
    raydiumProgramId,
  )

  const [tickArrayUpperPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(OBSERVATION_SEED), pool.toBuffer()],
    raydiumProgramId,
  )

  // Derive token accounts for the user
  const tokenAccount0 = await getAssociatedTokenAddress(
    nftOwner.publicKey,
    dawnMint,
  )
  const tokenAccount1 = await getAssociatedTokenAddress(
    nftOwner.publicKey,
    usdcMint,
  )

  // Step 2: Prepare transaction and instruction
  await program.methods
    .increaseLiquidityV2(
      liquidity, // Liquidity amount as u128
      amount0Max, // Maximum amount of token 0 to deposit
      amount1Max, // Maximum amount of token 1 to deposit
      baseFlag, // Optional base flag (if used)
    )
    .accounts({
      nftOwner: nftOwner.publicKey, // Signer who owns the NFT
      nftAccount: nftAccount.address, // NFT token account
      poolState: pool, // Pool state account
      protocolPosition: protocolPositionPda, // Protocol position account
      personalPosition: personalPositionPda, // Personal position account
      tickArrayLower: tickArrayLowerPda, // Lower tick array
      tickArrayUpper: tickArrayUpperPda, // Upper tick array
      tokenAccount0: tokenAccount0, // Token account for token 0
      tokenAccount1: tokenAccount1, // Token account for token 1
      tokenVault0: tokenVault0Pda, // Pool's vault account for token 0
      tokenVault1: tokenVault1Pda, // Pool's vault account for token 1
      vault0Mint: dawnMint, // Token mint for token 0 (Dawn)
      vault1Mint: usdcMint, // Token mint for token 1 (USDC)
      tokenProgram2022: TOKEN_PROGRAM_ID, // Token program 2022
      tokenProgram: TOKEN_PROGRAM_ID, // SPL Token program
    })
    .signers([nftOwner])
    .rpc()

  console.log('Liquidity increased successfully')
}
