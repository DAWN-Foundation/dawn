import * as anchor from '@coral-xyz/anchor'
import path from 'path'
import fs from 'fs'
import { Program, BN, Idl } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { execSync } from 'child_process'

import { AmmV3 } from '../../target/types/amm_v3'

import { createAmmConfig } from './create_config'
import { createOperationAccount } from './operation_account'
import { createPool } from './create_pool'
import { openPosition } from './open_position'
import {
  createAccount,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token'

export const SIX_DECIMALS = new BN(10).pow(new BN(6))

export const OPERATION_SEED = 'operation'
export const OBSERVATION_SEED = 'observation'
export const POOL_SEED = 'pool'
export const POOL_VAULT_SEED = 'pool_vault'
export const TICK_ARRAY_BITMAP_SEED = 'pool_tick_array_bitmap_extension'
export const POSITION_SEED = 'position'
export const TICK_ARRAY_SEED = 'tick_array'

export function loadWallet(): anchor.Wallet {
  const walletPath = `${require('os').homedir()}/.config/solana/id.json`
  const secretKeyString = fs.readFileSync(walletPath, 'utf8')
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString))
  const keypair = Keypair.fromSecretKey(secretKey)
  return new anchor.Wallet(keypair)
}

// Helper to deploy the Raydium CLMM
export function deployRaydium() {
  // Deploy the program
  console.log('Deploying Raydium CLMM...')
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

export async function setupRaydium(dawnMint: PublicKey, usdcMint: PublicKey) {
  // Deploy Raydium CLMM
  const raydium = deployRaydium()
  console.log({ raydium: raydium.toBase58() })

  // wait 2.5 seconds for the program to be deployed
  await new Promise((resolve) => setTimeout(resolve, 2_500))

  let [mint0, mint1, mint0Base] =
    Buffer.compare(dawnMint.toBuffer(), usdcMint.toBuffer()) < 0
      ? [dawnMint, usdcMint, true]
      : [usdcMint, dawnMint, false]

  console.log({ mint0: mint0.toBase58(), mint1: mint1.toBase58(), mint0Base })

  // Create AMM config
  console.log('Creating AMM config...')
  const configPda = await createAmmConfig(raydium, mint0, mint1)

  // Create operation account
  console.log('Creating operation account...')
  await createOperationAccount(mint0, mint1)

  // Create DAWN-USDC pool
  console.log('Creating DAWN-USDC pool...')
  const poolPda = await createPool(raydium, configPda, mint0, mint1, mint0Base)

  // Find observation account PDA
  const [observationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(OBSERVATION_SEED), poolPda.toBuffer()],
    raydium,
  )
  console.log({ observation_PDA: observationPda.toBase58() })

  // Find USDC vault PDA
  const [usdcVault] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_VAULT_SEED), poolPda.toBuffer(), usdcMint.toBuffer()],
    raydium,
  )
  console.log({ usdc_vault: usdcVault.toBase58() })

  // Find DAWN vault PDA
  const [dawnVault] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_VAULT_SEED), poolPda.toBuffer(), dawnMint.toBuffer()],
    raydium,
  )
  console.log({ dawn_vault: dawnVault.toBase58() })

  // Open position
  console.log('Opening position...')
  await openPosition(mint0, mint1, mint0Base)

  // // Swap
  // console.log('Swapping...')
  // await swap(mint0, mint1)

  return { raydium, poolPda, configPda, observationPda, usdcVault, dawnVault }
}
