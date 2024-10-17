import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { execSync } from 'child_process'
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

// Function to compute integer square root of a BN (BigNumber)
function sqrtBn(value: BN): BN {
  let x = value
  let z = value.div(new BN(2)).add(new BN(1))
  while (z.lt(x)) {
    x = z
    z = value.div(z).add(z).div(new BN(2))
  }
  return x
}

export async function createPool(
  provider: anchor.AnchorProvider,
  payer: anchor.web3.Keypair,
  raydium: PublicKey,
  ammConfig: PublicKey, // amm_config public key
  mint0: PublicKey,
  mint1: PublicKey,
  mint0Base: boolean,
) {
  const program = getRaydiumProgram(provider)

  // Derive the pool PDA
  const [poolStatePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(POOL_SEED),
      ammConfig.toBuffer(),
      mint0.toBuffer(),
      mint1.toBuffer(),
    ],
    raydium,
  )
  console.log('Pool PDA', poolStatePda.toBase58())

  const initialPrice = mint0Base ? '2' : '0.5'

  const output = execSync(
    `../raydium-clmm/target/release/client \
    --mint0 ${mint0.toBase58()} \
    --mint1 ${mint1.toBase58()} \
    create-pool 0 ${initialPrice} ${mint0.toBase58()} ${mint1.toBase58()}`,
    {
      encoding: 'utf-8',
    },
  )

  console.log('create pool output', output)
  return

  // Set initial price to 2 USDC per 1 DAWN or 0.5 DAWN per 1 USDC
  const price = mint0Base
    ? new BN(2).mul(new BN(10).pow(new BN(6 - 9)))
    : new BN(500)
  // Square root of the price
  const sqrtPrice = sqrtBn(price)
  // Multiply sqrtPrice by 2^64 to shift into Q64.64
  const shiftBy64 = new BN(2).pow(new BN(64))
  const sqrtPriceX64 = sqrtPrice.mul(shiftBy64)

  console.log({
    price: price.toString(),
    sqrtPrice: sqrtPrice.toString(),
    sqrtPriceX64: sqrtPriceX64.toString(),
  })

  // Derive token vaults PDAs
  const [tokenVault0Pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_VAULT_SEED), poolStatePda.toBuffer(), mint0.toBuffer()],
    raydium,
  )

  const [tokenVault1Pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_VAULT_SEED), poolStatePda.toBuffer(), mint1.toBuffer()],
    raydium,
  )

  // Derive the observation and tick array bitmap PDAs
  const [observationStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from(OBSERVATION_SEED), poolStatePda.toBuffer()],
    raydium,
  )

  const [tickArrayBitmapPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(TICK_ARRAY_BITMAP_SEED), poolStatePda.toBuffer()],
    raydium,
  )

  const openTime = Math.floor(Date.now() / 1000) // Current timestamp as the open time

  // Prepare transaction and create pool
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
