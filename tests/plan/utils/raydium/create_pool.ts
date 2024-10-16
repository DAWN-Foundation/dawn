import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import {
  getRaydiumProgram,
  OBSERVATION_SEED,
  POOL_SEED,
  POOL_VAULT_SEED,
  SIX_DECIMALS,
  TICK_ARRAY_BITMAP_SEED,
  toQ64_64,
} from '.'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

export async function createPool(
  provider: anchor.AnchorProvider,
  payer: anchor.web3.Keypair,
  raydium: PublicKey,
  ammConfig: PublicKey, // amm_config public key
  mint0: PublicKey,
  mint1: PublicKey,
) {
  const program = getRaydiumProgram(provider)

  // Step 2: Derive the pool PDA
  const [poolStatePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(POOL_SEED),
      ammConfig.toBuffer(),
      mint0.toBuffer(),
      mint1.toBuffer(),
    ],
    raydium,
  )

  // Step 3: Calculate sqrt_price_x64 (ratio of dawn to USDC)
  const dawnAmount = new BN(1_000_000).mul(SIX_DECIMALS) // 1M Dawn with 6 decimals
  const usdcAmount = new BN(500_000).mul(SIX_DECIMALS) // 500K USDC with 6 decimals
  const sqrtPrice = dawnAmount.div(usdcAmount).sqr() // Calculate square root of the price
  const sqrtPriceX64 = toQ64_64(sqrtPrice) // Convert to Q64.64 format

  // Step 4: Derive token vaults PDAs
  const [tokenVault0Pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(POOL_VAULT_SEED),
      poolStatePda.toBuffer(),
      mint0.toBuffer(),
    ],
    raydium,
  )

  const [tokenVault1Pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(POOL_VAULT_SEED),
      poolStatePda.toBuffer(),
      mint1.toBuffer(),
    ],
    raydium,
  )

  // Step 5: Derive the observation and tick array bitmap PDAs
  const [observationStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from(OBSERVATION_SEED), poolStatePda.toBuffer()],
    raydium,
  )

  const [tickArrayBitmapPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(TICK_ARRAY_BITMAP_SEED), poolStatePda.toBuffer()],
    raydium,
  )

  const openTime = Math.floor(Date.now() / 1000) // Current timestamp as the open time

  // Step 6: Prepare transaction and create pool
  await program.methods
    .createPool(sqrtPriceX64, new BN(openTime))
    .accounts({
      poolCreator: payer.publicKey, // Who is creating the pool
      ammConfig: ammConfig, // Which AMM config the pool belongs to
      poolState: poolStatePda, // The pool state PDA
      tokenMint0: mint0, // Smaller mint (dawnMint or usdcMint)
      tokenMint1: mint1, // Larger mint (dawnMint or usdcMint)
      tokenVault0: tokenVault0Pda, // Token vault for token 0
      tokenVault1: tokenVault1Pda, // Token vault for token 1
      observationState: observationStatePda, // Observation state PDA
      tickArrayBitmap: tickArrayBitmapPda, // Tick array bitmap PDA
      tokenProgram0: TOKEN_PROGRAM_ID, // Token program for mint 0
      tokenProgram1: TOKEN_PROGRAM_ID, // Token program for mint 1
      systemProgram: SystemProgram.programId, // Solana system program
      rent: anchor.web3.SYSVAR_RENT_PUBKEY, // Rent sysvar account
    })
    .signers([payer]) // Pool creator must sign
    .rpc()

  console.log('Pool created successfully', poolStatePda.toBase58())

  return poolStatePda
}
