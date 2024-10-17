import * as anchor from '@coral-xyz/anchor'
import path from 'path'
import fs from 'fs'
import { Program, BN, Idl } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { execSync } from 'child_process'
import { AmmV3 } from '../../../../target/types/amm_v3'

export const SIX_DECIMALS = new BN(10).pow(new BN(6))

export const OPERATION_SEED = 'operation'
export const OBSERVATION_SEED = 'observation'
export const POOL_SEED = 'pool'
export const POOL_VAULT_SEED = 'pool_vault'
export const TICK_ARRAY_BITMAP_SEED = 'pool_tick_array_bitmap_extension'
export const POSITION_SEED = 'position'
export const TICK_ARRAY_SEED = 'tick_array'

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

export function toQ64_64(decimal: BN): BN {
  const Q64 = new BN(1).shln(64)
  return decimal.mul(Q64)
}

export function getRaydiumProgram(provider: anchor.AnchorProvider) {
  const idlPath = path.resolve('target/idl/amm_v3.json')
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'))
  const raydiumProgram = new Program(idl as AmmV3, provider)
  return raydiumProgram
}
