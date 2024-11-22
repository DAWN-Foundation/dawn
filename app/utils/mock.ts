import fs from 'fs'
import * as anchor from '@coral-xyz/anchor'
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import { AddedAccount, startAnchor } from 'solana-bankrun'
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from 'spl-token-bankrun'

import { Mock } from './types'
import { deviceTypeSeed, getPlanPda } from './helpers'
import { setupRaydium } from './raydium'
import { getDawnProgram } from '../dawn/utils'

export const USDC_DECIMALS = new BN(10).pow(new BN(6))

export const PROGRAM_ID = new PublicKey(
  'GtVh6exdiedD7cXXUxJz3Wgj3d6o3nhXqCM2uYPNfact',
)

export const RAYDIUM_PROGRAM_ID = new PublicKey(
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
)

export const RAYDIUM_CONFIG = new PublicKey(
  'D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2',
)

export const RAYDIUM_POOL_FEE_RECEIVER = new PublicKey(
  'DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8',
)

export let mock: Mock
let provider: BankrunProvider

export async function getProvider(accounts?: AddedAccount[]) {
  if (provider) return provider
  const context = await startAnchor(
    '.',
    [
      { name: 'dawn', programId: PROGRAM_ID },
      { name: 'raydium', programId: RAYDIUM_PROGRAM_ID },
    ],
    accounts ?? [],
  )
  provider = new BankrunProvider(context)
  const wallet = loadWallet()
  provider.wallet = new Wallet(wallet.payer)
  return provider
}

export async function confirmTx(provider: BankrunProvider, tx: Transaction) {
  tx.recentBlockhash = (
    await provider.context.banksClient.getLatestBlockhash()
  )[0]
  tx.feePayer = provider.wallet.publicKey

  tx.sign(provider.wallet.payer)

  const txDetails = await provider.context.banksClient.processTransaction(tx)
  return txDetails
}

// helper function to load the wallet from the local file system
export function loadWallet(): anchor.Wallet {
  const walletPath = `${require('os').homedir()}/.config/solana/id.json`
  const secretKeyString = fs.readFileSync(walletPath, 'utf8')
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString))
  const keypair = Keypair.fromSecretKey(secretKey)
  return new anchor.Wallet(keypair)
}

export async function createAccounts() {
  // Load wallet
  console.log('Loading local wallet...')
  const wallet = loadWallet().payer

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
  const serviceProvider = Keypair.generate()

  // Create Tester KeyPair
  console.log('Creating Tester KeyPair...')
  const customer = Keypair.generate()

  const newAccounts = {
    wallet,
    dao,
    validatorPool,
    medallionPool,
    serviceProvider,
    customer,
  }

  const addedAccounts = Object.values(newAccounts).map((acc) => ({
    address: acc.publicKey,
    info: {
      lamports: 1000_000_000_000,
      executable: false,
      owner: anchor.web3.SystemProgram.programId,
      data: Buffer.alloc(0),
    },
  }))

  // Connection to mainnet for cloning accounts
  const connection = new Connection('https://api.mainnet-beta.solana.com')

  // Add Raydium config account
  const raydiumConfig = await connection.getAccountInfo(RAYDIUM_CONFIG)
  addedAccounts.push({
    address: RAYDIUM_CONFIG,
    info: raydiumConfig,
  })

  // Add Raydium pool fee receiver account
  const raydiumPoolFeeReceiver = await connection.getAccountInfo(
    RAYDIUM_POOL_FEE_RECEIVER,
  )
  addedAccounts.push({
    address: RAYDIUM_POOL_FEE_RECEIVER,
    info: raydiumPoolFeeReceiver,
  })

  return {
    ...newAccounts,
    addedAccounts,
  }
}

// Setup the environment for tests and set the mock
// only run once in `initialize` test
export async function setup(
  provider: BankrunProvider,
  accounts: Awaited<ReturnType<typeof createAccounts>>,
) {
  const {
    wallet,
    dao,
    validatorPool,
    medallionPool,
    serviceProvider,
    customer,
  } = accounts

  // Mint test USDC token
  console.log('Minting test USDC token...')
  const usdcMint = await createMint(
    provider.context.banksClient, // Banks client
    wallet, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USDC)
  )
  // Mint test DAWN token
  console.log('Minting test DAWN token...')
  const dawnMint = await createMint(
    provider.context.banksClient, // Banks client
    wallet, // Payer for transaction
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
  const daoDawnAccount = await createAssociatedTokenAccount(
    provider.context.banksClient, // Banks client
    dao, // Payer for transaction
    dawnMint, // Mint
    dao.publicKey, // Token account owner
  )

  // Create DAWN account for Validator Pool
  console.log('Creating DAWN account for Validator Pool...')
  const validatorDawnAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    validatorPool,
    dawnMint,
    validatorPool.publicKey,
  )

  // Create DAWN account for Medallion Pool
  console.log('Creating DAWN account for Medallion Pool...')
  const medallionDawnAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    medallionPool,
    dawnMint,
    medallionPool.publicKey,
  )

  // Create DAWN account for Service Provider
  console.log('Creating DAWN account for Service Provider...')
  const serviceProviderDawnAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    serviceProvider,
    dawnMint,
    serviceProvider.publicKey,
  )

  // Create USDC account for Service Provider
  console.log('Creating USDC account for Service Provider...')
  const serviceProviderUsdcAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    serviceProvider,
    usdcMint,
    serviceProvider.publicKey,
  )

  // Create USDC account for Tester
  console.log('Creating USDC account for Tester...')
  const customerUsdcAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    customer,
    usdcMint,
    customer.publicKey,
  )

  // Create DAWN token account for Tester
  console.log('Creating DAWN token account for Tester...')
  const customerDawnAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    customer,
    dawnMint,
    customer.publicKey,
  )

  // Create DAWN token account for wallet
  console.log('Creating DAWN token account for wallet...')
  const walletDawnAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    wallet,
    dawnMint,
    wallet.publicKey,
  )

  // Create USDC token account for wallet
  console.log('Creating USDC token account for wallet...')
  const walletUsdcAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    wallet,
    usdcMint,
    wallet.publicKey,
  )

  // Mint 1_000_000 USDC to wallet
  console.log('Minting 1_000_000 USDC to wallet...')
  await mintTo(
    provider.context.banksClient, // Banks client
    wallet, // Payer for transaction
    usdcMint, // Mint
    walletUsdcAccount, // Token account
    wallet.publicKey, // Mint authority
    BigInt(1_000_000_000_000), // 6 decimals
  )

  // Mint 1_000_000 DAWN to wallet
  console.log('Minting 1_000_000 DAWN to wallet...')
  await mintTo(
    provider.context.banksClient, // Banks client
    wallet, // Payer for transaction
    dawnMint, // Mint
    walletDawnAccount, // Token account
    wallet.publicKey, // Mint authority
    BigInt(1_000_000_000_000), // 6 decimals
  )

  const { raydium, config, pool, auth, obs, dawnVault, usdcVault } =
    await setupRaydium(
      provider,
      wallet,
      dawnMint,
      usdcMint,
      walletDawnAccount,
      walletUsdcAccount,
    )

  const daoFee = new BN(300) // 3% fee (dao_fee)
  const validatorFee = new BN(300) // 3% fee (validator_fee)
  const medallionFee = new BN(900) // 9% fee (medallion_fee)

  const program = getDawnProgram(provider)
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

  const deviceType = { router: {} }
  const deviceManufacturer = 'MikroTik'
  const deviceModel = 'GG69420'

  const [deviceModelPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device_model'),
      deviceTypeSeed(deviceType),
      Buffer.from(deviceManufacturer),
      Buffer.from(deviceModel),
    ],
    program.programId,
  )

  const deviceLatitude = new BN(1).mul(new BN(10).pow(new BN(10)))
  const deviceLongitude = new BN(1).mul(new BN(10).pow(new BN(10)))

  const [devicePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device'),
      Buffer.from(serviceProvider.publicKey.toBytes()),
      Buffer.from(deviceModelPda.toBytes()),
      Buffer.from(deviceLatitude.toArray('le', 8)),
      Buffer.from(deviceLongitude.toArray('le', 8)),
    ],
    program.programId,
  )

  const planPrice = new BN(100).mul(USDC_DECIMALS)
  const planDuration = 30
  const planSpeed = 1_000
  const planCapacity = new BN(1000)
  const planSlaId = new BN(1)

  const [planPda, planBump] = getPlanPda(
    program,
    devicePda,
    planPrice,
    planDuration,
    planSpeed,
    planCapacity,
    planSlaId,
  )

  const [subscriptionPda, subscriptionBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('subscription'),
      Buffer.from(planPda.toBytes()),
      Buffer.from(customer.publicKey.toBytes()),
    ],
    program.programId,
  )

  // Create USDC vault token account for subscription escrow
  console.log('Creating USDC vault token account for subscription escrow...')
  const escrowUsdcVault = await createAssociatedTokenAccount(
    provider.context.banksClient,
    serviceProvider,
    usdcMint,
    subscriptionPda,
  )

  // Create DAWN vault token account for subscription escrow
  console.log('Creating DAWN vault token account for subscription escrow...')
  const escrowDawnVault = await createAssociatedTokenAccount(
    provider.context.banksClient,
    serviceProvider,
    dawnMint,
    subscriptionPda,
  )

  mock = {
    dao,
    validatorPool,
    medallionPool,
    serviceProvider,
    customer,
    // mints
    usdcMint,
    dawnMint,
    // token accounts
    daoDawnAccount,
    validatorDawnAccount,
    medallionDawnAccount,
    serviceProviderDawnAccount,
    serviceProviderUsdcAccount,
    customerDawnAccount,
    customerUsdcAccount,
    walletDawnAccount,
    walletUsdcAccount,
    escrowDawnVault,
    escrowUsdcVault,
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
    // PDAs
    configPda,
    deviceModelPda,
    devicePda,
    planPda,
    planBump,
    // device
    deviceType,
    deviceManufacturer,
    deviceModel,
    deviceLatitude,
    deviceLongitude,
    // plan
    planPrice,
    planDuration,
    planSpeed,
    planCapacity,
    planSlaId,
    // subscription
    subscriptionPda,
    subscriptionBump,
  }

  return mock
}
