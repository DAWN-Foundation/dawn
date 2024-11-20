import fs from 'fs'
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import { AddedAccount, startAnchor } from 'solana-bankrun'
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token'

import { Mock } from './types'
import { fund, getPlanPda } from './helpers'
import { setupRaydium } from './raydium'
import { getDawnProgram } from '../dawn/utils'
import { createAccounts, USDC_DECIMALS } from './mock'

/// Denominator of geo coordinates (Basis Points)
const COORD_DENOMINATOR = new BN(10).pow(new BN(10));

// Prepares the local validator for testnet simulation
// Creates all necessary accounts and mints tokens
// Only run once in `testnet` script for validator setup
export async function prepare(
  provider: AnchorProvider,
  accounts: Awaited<ReturnType<typeof createAccounts>>,
): Promise<Mock> {
  const {
    wallet,
    dao,
    validatorPool,
    medallionPool,
    serviceProvider,
    customer,
  } = accounts

  // Fund wallet
  console.log('Funding wallet...')
  await fund(provider.connection, wallet.publicKey, 1000)

  // Fund DAWN DAO Account
  console.log('Funding DAWN DAO Account...')
  await fund(provider.connection, dao.publicKey, 1000)

  // Fund Validator Pool Account
  console.log('Funding Validator Pool Account...')
  await fund(provider.connection, validatorPool.publicKey, 1000)

  // Fund Medallion Pool Account
  console.log('Funding Medallion Pool Account...')
  await fund(provider.connection, medallionPool.publicKey, 1000)

  // Fund Service Provider Account
  console.log('Funding Service Provider Account...')
  await fund(provider.connection, serviceProvider.publicKey, 1000)

  // Fund Customer Account
  // we await for the transaction to be finalized to ensure all accounts are funded
  console.log('Funding Customer Account...')
  await fund(provider.connection, customer.publicKey, 1000, 'finalized')

  // Mint test USDC token
  console.log('Minting test USDC token...')
  const usdcMint = await createMint(
    provider.connection,
    wallet, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USDC)
  )

  // Mint test DAWN token
  console.log('Minting test DAWN token...')
  const dawnMint = await createMint(
    provider.connection,
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
    provider.connection,
    dao,
    dawnMint,
    dao.publicKey,
  )

  // Create DAWN account for Validator Pool
  console.log('Creating DAWN account for Validator Pool...')
  const validatorDawnAccount = await createAssociatedTokenAccount(
    provider.connection,
    validatorPool,
    dawnMint,
    validatorPool.publicKey,
  )

  // Create DAWN account for Medallion Pool
  console.log('Creating DAWN account for Medallion Pool...')
  const medallionDawnAccount = await createAssociatedTokenAccount(
    provider.connection,
    medallionPool,
    dawnMint,
    medallionPool.publicKey,
  )

  // Create DAWN account for Service Provider
  console.log('Creating DAWN account for Service Provider...')
  const serviceProviderDawnAccount = await createAssociatedTokenAccount(
    provider.connection,
    serviceProvider,
    dawnMint,
    serviceProvider.publicKey,
  )

  // Create USDC account for Service Provider
  console.log('Creating USDC account for Service Provider...')
  const serviceProviderUsdcAccount = await createAssociatedTokenAccount(
    provider.connection,
    serviceProvider,
    usdcMint,
    serviceProvider.publicKey,
  )

  // Create USDC account for Customer
  console.log('Creating USDC account for Customer...')
  const customerUsdcAccount = await createAssociatedTokenAccount(
    provider.connection,
    customer,
    usdcMint,
    customer.publicKey,
  )

  // Create DAWN token account for Customer
  console.log('Creating DAWN token account for Customer...')
  const customerDawnAccount = await createAssociatedTokenAccount(
    provider.connection,
    customer,
    dawnMint,
    customer.publicKey,
  )

  // Create DAWN token account for wallet
  console.log('Creating DAWN token account for wallet...')
  const walletDawnAccount = await createAssociatedTokenAccount(
    provider.connection,
    wallet,
    dawnMint,
    wallet.publicKey,
  )

  // Create USDC token account for wallet
  console.log('Creating USDC token account for wallet...')
  const walletUsdcAccount = await createAssociatedTokenAccount(
    provider.connection,
    wallet,
    usdcMint,
    wallet.publicKey,
  )

  // Mint 1_000_000 USDC to wallet
  console.log('Minting 1_000_000 USDC to wallet...')
  await mintTo(
    provider.connection,
    wallet, // Payer for transaction
    usdcMint, // Mint
    walletUsdcAccount, // Token account
    wallet.publicKey, // Mint Authority
    BigInt(1_000_000_000_000), // 6 decimals
  )

  // Mint 1_000_000 DAWN to wallet
  console.log('Minting 1_000_000 DAWN to wallet...')
  await mintTo(
    provider.connection,
    wallet, // Payer for transaction
    dawnMint, // Mint
    walletDawnAccount, // Token account
    wallet.publicKey, // Mint Authority
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
  const deviceManufacturer = '123 Main St'
  const deviceModel = "GG69420"
  const deviceLatitude = new BN(0.0000000001).mul(COORD_DENOMINATOR)
  const deviceLongitude = new BN(0.0000000001).mul(COORD_DENOMINATOR)

  const [devicePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device'),
      Buffer.from([0, 0, 0, 0, 0, 0]),
      Buffer.from(deviceManufacturer),
      Buffer.from(deviceModel),
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
  const { address: escrowUsdcVault } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    serviceProvider,
    usdcMint,
    subscriptionPda,
    true,
  )

  // Create DAWN vault token account for subscription escrow
  console.log('Creating DAWN vault token account for subscription escrow...')
  const { address: escrowDawnVault } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    serviceProvider,
    dawnMint,
    subscriptionPda,
    true,
  )

  return {
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
}
