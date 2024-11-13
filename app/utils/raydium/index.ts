import * as anchor from '@coral-xyz/anchor'
import path from 'path'
import fs from 'fs'
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

import { createPool } from './create_pool'
import { deposit } from './deposit'
import { RaydiumCpSwap } from '../../../raydium/raydium_cp_swap'
import { getPoolVaultAddress } from './pda'
import { BankrunProvider } from 'anchor-bankrun'

const RAYDIUM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C')
const RAYDIUM_CONFIG = new PublicKey(
  'D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2',
)

export function getRaydiumProgram(provider: BankrunProvider | AnchorProvider) {
  const idlPath = path.resolve('raydium/raydium_cp_swap.json')
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'))
  return new Program(idl as RaydiumCpSwap, RAYDIUM, provider)
}

export async function setupRaydium(
  provider: BankrunProvider | AnchorProvider,
  wallet: Keypair,
  dawnMint: PublicKey,
  usdcMint: PublicKey,
  walletDawnAccount: PublicKey,
  walletUsdcAccount: PublicKey,
) {
  const program = getRaydiumProgram(provider)

  // Sort the tokens
  const [mint0, mint1, walletMint0, walletMint1, dawnIsBase] =
    Buffer.compare(dawnMint.toBuffer(), usdcMint.toBuffer()) < 0
      ? [dawnMint, usdcMint, walletDawnAccount, walletUsdcAccount, true]
      : [usdcMint, dawnMint, walletUsdcAccount, walletDawnAccount, false]

  console.log({
    mint0: mint0.toBase58(),
    mint1: mint1.toBase58(),
    walletMint0: walletMint0.toBase58(),
    walletMint1: walletMint1.toBase58(),
    pool_symbol: dawnIsBase ? 'DAWN/USDC' : 'USDC/DAWN',
  })

  // Create DAWN-USDC pool
  console.log('Creating DAWN-USDC pool...')
  const { pool, auth, obs } = await createPool(
    program,
    wallet,
    RAYDIUM_CONFIG,
    mint0,
    mint1,
    walletMint0,
    walletMint1,
    dawnIsBase,
  )

  // Deposit
  console.log('Depositing...')
  await deposit(
    program,
    wallet,
    RAYDIUM_CONFIG,
    mint0,
    mint1,
    walletMint0,
    walletMint1,
    dawnIsBase,
  )

  const [dawnVault] = getPoolVaultAddress(pool, dawnMint, program.programId)
  const [usdcVault] = getPoolVaultAddress(pool, usdcMint, program.programId)

  return {
    raydium: RAYDIUM,
    config: RAYDIUM_CONFIG,
    pool,
    auth,
    obs,
    dawnVault,
    usdcVault,
  }
}
