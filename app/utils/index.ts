import * as anchor from '@coral-xyz/anchor'
import path from 'path'
import fs from 'fs'
import { Program, BN, Idl, Wallet } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { execSync } from 'child_process'

import { createAmmConfig } from './create_config'
import { createPool } from './create_pool'
import { deposit } from './deposit'
import {
  createAccount,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { RaydiumCpSwap, IDL } from '../../raydium/raydium_cp_swap'

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
  console.log('Deploying Raydium CP Swap...')
  const output = execSync(
    'cd ../raydium-cp-swap && anchor deploy --provider.cluster localnet',
    {
      encoding: 'utf-8',
    },
  )
  console.log('Raydium CP Swap deploy completed successfully')
  console.log('Output:', output.toString())
  const raydium = output
    .toString()
    .split('\n')
    .find((line) => line.startsWith('Program Id: '))
    .split('Program Id: ')[1]

  return new PublicKey(raydium)
}

export function getRaydiumProgram(provider: anchor.AnchorProvider) {
  const idlPath = path.resolve('raydium/raydium_cp_swap.json')
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'))
  const raydiumProgram = new Program(
    idl as RaydiumCpSwap,
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
    provider,
  )
  return raydiumProgram
}

export async function setupRaydium(
  provider: anchor.AnchorProvider,
  wallet: Wallet,
  dawnMint: PublicKey,
  usdcMint: PublicKey,
  userDawnAccount: PublicKey,
  userUsdcAccount: PublicKey,
) {
  // Deploy Raydium CP Swap
  // const raydium = deployRaydium()
  const raydium = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C')
  console.log({ raydium: raydium.toBase58() })

  const program = getRaydiumProgram(provider)

  // wait 2.5 seconds for the program to be deployed
  await new Promise((resolve) => setTimeout(resolve, 2_500))

  let [mint0, mint1, userMint0, userMint1, mint0IsBase] =
    Buffer.compare(dawnMint.toBuffer(), usdcMint.toBuffer()) < 0
      ? [dawnMint, usdcMint, userDawnAccount, userUsdcAccount, true]
      : [usdcMint, dawnMint, userUsdcAccount, userDawnAccount, false]

  console.log({
    mint0: mint0.toBase58(),
    mint1: mint1.toBase58(),
    userMint0: userMint0.toBase58(),
    userMint1: userMint1.toBase58(),
    mint0IsBase,
  })

  // Create AMM config
  // console.log('Creating AMM config...')
  // const configPda = await createAmmConfig(program, wallet)
  const configPda = new PublicKey(
    'D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2',
  )

  // Create DAWN-USDC pool
  console.log('Creating DAWN-USDC pool...')
  const poolPda = await createPool(
    program,
    wallet,
    configPda,
    mint0,
    mint1,
    userMint0,
    userMint1,
  )

  // Deposit
  console.log('Depositing...')
  await deposit(program, wallet, configPda, mint0, mint1, userMint0, userMint1)

  // // Find observation account PDA
  // const [observationPda] = PublicKey.findProgramAddressSync(
  //   [Buffer.from(OBSERVATION_SEED), poolPda.toBuffer()],
  //   raydium,
  // )
  // console.log({ observation_PDA: observationPda.toBase58() })

  // // Find USDC vault PDA
  // const [usdcVault] = PublicKey.findProgramAddressSync(
  //   [Buffer.from(POOL_VAULT_SEED), poolPda.toBuffer(), usdcMint.toBuffer()],
  //   raydium,
  // )
  // console.log({ usdc_vault: usdcVault.toBase58() })

  // // Find DAWN vault PDA
  // const [dawnVault] = PublicKey.findProgramAddressSync(
  //   [Buffer.from(POOL_VAULT_SEED), poolPda.toBuffer(), dawnMint.toBuffer()],
  //   raydium,
  // )
  // console.log({ dawn_vault: dawnVault.toBase58() })

  // // Open position
  // console.log('Opening position...')
  // await openPosition(mint0, mint1, mint0Base)

  // // Swap
  // console.log('Swapping...')
  // await swap(mint0, mint1)

  return { raydium, configPda }
}
