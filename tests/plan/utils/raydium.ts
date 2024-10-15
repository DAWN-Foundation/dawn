import * as anchor from '@coral-xyz/anchor'
import path from 'path'
import fs from 'fs'
import { Program, BN } from '@coral-xyz/anchor'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import { execSync } from 'child_process'
import { AmmV3 } from '../../../target/types/amm_v3'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

const SIX_DECIMALS = new BN(10).pow(new BN(6))

const OBSERVATION_SEED = 'observation'
const POOL_SEED = 'pool'
const POOL_VAULT_SEED = 'pool_vault'
const TICK_ARRAY_BITMAP_SEED = 'pool_tick_array_bitmap_extension'

// Helper to deploy the Raydium CLMM
export function deployRaydium() {
  // Deploy the program
  const output = execSync(
    'cd ../raydium-clmm && anchor deploy --provider.cluster localnet',
    {
      encoding: 'utf-8',
    },
  )
  console.log('Raydium CLMM deploy completed successfully')
  console.log('Output:', output.toString())
  const raydium = output
    .toString()
    .split('\n')
    .find((line) => line.startsWith('Program Id: '))
    .split('Program Id: ')[1]

  return new PublicKey(raydium)
}

function toQ64_64(decimal: BN): BN {
  const Q64 = new BN(1).shln(64)
  return decimal.mul(Q64)
}

function getRaydiumProgram(provider: anchor.AnchorProvider) {
  const idlPath = path.resolve('target/idl/amm_v3.json')
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'))
  const raydiumProgram = new Program(idl as AmmV3, provider)
  return raydiumProgram
}

export async function createAmmConfig(
  provider: anchor.AnchorProvider,
  raydium: PublicKey,
  payer: Keypair,
) {
  const program = getRaydiumProgram(provider)

  const index = 0
  const tickSpacing = 1
  const tradeFeeRate = 30_000
  const protocolFeeRate = 5_000
  const fundFeeRate = 2_000

  const indexBuffer = Buffer.alloc(2) // 2 bytes for a 16-bit integer
  indexBuffer.writeUInt16LE(index)

  const [ammConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('amm_config'), indexBuffer],
    raydium,
  )

  await program.methods
    .createAmmConfig(
      index,
      tickSpacing,
      tradeFeeRate,
      protocolFeeRate,
      fundFeeRate,
    )
    .accounts({
      owner: payer.publicKey,
      ammConfig: ammConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log('Amm config created', ammConfigPda.toBase58())

  return ammConfigPda
}

export async function createPool(
  provider: anchor.AnchorProvider,
  raydium: PublicKey,
  dawnMint: PublicKey,
  usdcMint: PublicKey,
  payer: anchor.web3.Keypair,
  ammConfig: PublicKey, // amm_config public key
) {
  const program = getRaydiumProgram(provider)

  // Step 1: Ensure the correct token order (token_mint_0 < token_mint_1)
  let [tokenMint0, tokenMint1] =
    dawnMint < usdcMint ? [dawnMint, usdcMint] : [usdcMint, dawnMint]

  // Step 2: Derive the pool PDA
  const [poolStatePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(POOL_SEED),
      ammConfig.toBuffer(),
      tokenMint0.toBuffer(),
      tokenMint1.toBuffer(),
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
      tokenMint0.toBuffer(),
    ],
    raydium,
  )

  const [tokenVault1Pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(POOL_VAULT_SEED),
      poolStatePda.toBuffer(),
      tokenMint1.toBuffer(),
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
      tokenMint0: tokenMint0, // Smaller mint (dawnMint or usdcMint)
      tokenMint1: tokenMint1, // Larger mint (dawnMint or usdcMint)
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

export async function addLiquidity(
  provider: anchor.AnchorProvider,
  raydium: PublicKey,
  pool: PublicKey,
  payer: anchor.web3.Keypair,
) {
  const program = getRaydiumProgram(provider)
}
