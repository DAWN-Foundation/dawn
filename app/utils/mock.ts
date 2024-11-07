import fs from 'fs'
import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token'

import { Mock } from './types'
import { fund } from './helpers'
import { setupRaydium } from './raydium'
import { getDawnProgram } from '../dawn/utils'
import { AddedAccount, startAnchor } from 'solana-bankrun'

export const PROGRAM_ID = new PublicKey(
  'dawn111111111111111111111111111111111111111',
)

export let mock: Mock
let provider: BankrunProvider

export async function getProvider(accounts?: AddedAccount[]) {
  if (provider) {
    console.log('Using existing provider')
    return provider
  }
  const context = await startAnchor('.', [], accounts ?? [])
  provider = new BankrunProvider(context)
  return provider
}

// helper function to load the wallet from the local file system
export function loadWallet(): anchor.Wallet {
  const walletPath = `${require('os').homedir()}/.config/solana/id.json`
  const secretKeyString = fs.readFileSync(walletPath, 'utf8')
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString))
  const keypair = Keypair.fromSecretKey(secretKey)
  return new anchor.Wallet(keypair)
}

export function createAccounts() {
  // Load wallet
  console.log('Loading local wallet...')
  const wallet = loadWallet()

  // Create DAWN DAO KeyPair
  console.log('Creating DAWN DAO KeyPair...')
  const dao = Keypair.generate()

  // Create Validator Pool KeyPair
  console.log('Creating Validator Pool KeyPair...')
  const validatorPool = Keypair.generate()

  // Create Medallion Pool KeyPair
  console.log('Creating Medallion Pool KeyPair...')
  const medallionPool = Keypair.generate()

  // Create Service Provider KeyPair
  console.log('Creating Service Provider KeyPair...')
  const provider = Keypair.generate()

  // Create Tester KeyPair
  console.log('Creating Tester KeyPair...')
  const tester = Keypair.generate()

  const newAccounts = {
    wallet,
    dao,
    validatorPool,
    medallionPool,
    provider,
    tester,
  }

  return {
    ...newAccounts,
    addedAccounts: Object.values(newAccounts).map((acc) => ({
      address: acc.publicKey,
      info: {
        lamports: 1000_000_000_000,
        executable: false,
        owner: anchor.web3.SystemProgram.programId,
        data: Buffer.alloc(0),
      },
    })),
  }
}

// Setup the environment for tests and set the mock
// only run once in `initialize` test
export async function setup(
  provider: BankrunProvider,
  accounts: ReturnType<typeof createAccounts>,
  isTestnet: boolean = false,
) {
  const {
    wallet,
    dao,
    validatorPool,
    medallionPool,
    provider: serviceProvider,
    tester,
  } = accounts

  // // Fund wallet
  // console.log('Funding wallet...')
  // await fund(
  //   provider.connection,
  //   wallet.publicKey,
  //   1000,
  //   isTestnet ? 'finalized' : 'confirmed',
  // )

  // Mint test USDC token
  console.log('Minting test USDC token...')
  const usdcMint = await createMint(
    provider.connection,
    wallet.payer, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USDC)
  )
  // Mint test DAWN token
  console.log('Minting test DAWN token...')
  const dawnMint = await createMint(
    provider.connection,
    wallet.payer, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for DAWN)
  )

  console.log({
    usdc_mint: usdcMint.toBase58(),
    dawn_mint: dawnMint.toBase58(),
  })

  // Create DAWN account for DAWN DAO
  console.log('Creating DAWN account for DAWN DAO...')
  const { address: daoDawnAccount } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    dao,
    dawnMint,
    dao.publicKey,
  )

  // Create DAWN account for Validator Pool
  console.log('Creating DAWN account for Validator Pool...')
  const { address: validatorDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      validatorPool,
      dawnMint,
      validatorPool.publicKey,
    )

  // Create DAWN account for Medallion Pool
  console.log('Creating DAWN account for Medallion Pool...')
  const { address: medallionDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      medallionPool,
      dawnMint,
      medallionPool.publicKey,
    )

  // Create DAWN account for Service Provider
  console.log('Creating DAWN account for Service Provider...')
  const { address: providerDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      serviceProvider,
      dawnMint,
      serviceProvider.publicKey,
    )

  // Create USDC account for Service Provider
  console.log('Creating USDC account for Service Provider...')
  const { address: providerUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      serviceProvider,
      usdcMint,
      serviceProvider.publicKey,
    )

  // Create USDC account for Tester
  console.log('Creating USDC account for Tester...')
  const { address: testerUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      tester,
      usdcMint,
      tester.publicKey,
    )

  // Create DAWN token account for Tester
  console.log('Creating DAWN token account for Tester...')
  const { address: testerDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      tester,
      dawnMint,
      tester.publicKey,
    )

  // Create DAWN token account for wallet.payer
  console.log('Creating DAWN token account for wallet.payer...')
  const { address: userDawnAccount } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    dawnMint,
    wallet.payer.publicKey,
  )

  // Create USDC token account for wallet.payer
  console.log('Creating USDC token account for wallet.payer...')
  const { address: userUsdcAccount } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    usdcMint,
    wallet.payer.publicKey,
  )

  // Mint 1_000_000 USDC to user
  console.log('Minting 1_000_000 USDC to wallet.payer...')
  await mintTo(
    provider.connection,
    wallet.payer,
    usdcMint,
    userUsdcAccount,
    wallet.payer,
    BigInt(1_000_000_000_000), // 6 decimals
  )

  // Mint 1_000_000 DAWN to user
  console.log('Minting 1_000_000 DAWN to wallet.payer...')
  await mintTo(
    provider.connection,
    wallet.payer,
    dawnMint,
    userDawnAccount,
    wallet.payer,
    BigInt(1_000_000_000_000), // 6 decimals
  )
  // BigInt(1_000_000_000_000_000), // 9 decimals

  const { raydium, config, pool, auth, obs, dawnVault, usdcVault } =
    await setupRaydium(
      provider,
      wallet,
      dawnMint,
      usdcMint,
      userDawnAccount,
      userUsdcAccount,
    )

  // await new Promise((resolve) => setTimeout(resolve, 120_000))

  const daoFee = new BN(300) // 3% fee (dao_fee)
  const validatorFee = new BN(300) // 3% fee (validator_fee)
  const medallionFee = new BN(900) // 9% fee (medallion_fee)

  const program = getDawnProgram(provider)
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

  mock = {
    dao,
    validatorPool,
    medallionPool,
    provider: serviceProvider,
    tester,
    // mints
    usdcMint,
    dawnMint,
    // token accounts
    daoDawnAccount,
    validatorDawnAccount,
    medallionDawnAccount,
    providerDawnAccount,
    providerUsdcAccount,
    testerUsdcAccount,
    testerDawnAccount,
    // raydium
    raydium,
    raydiumConfig: config,
    raydiumAuthority: auth,
    raydiumPool: pool,
    raydiumObservation: obs,
    raydiumDawnVault: dawnVault,
    raydiumUsdcVault: usdcVault,
    // config
    daoFee,
    validatorFee,
    medallionFee,
    // plan
    configPda,
  }

  return mock
}
