import { AnchorProvider, BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token'

import { Mock } from './types'
import {
  COORD_DENOMINATOR,
  deviceTypeSeed,
  fund,
  getPlanPda,
  IpV4Bytes,
  IpV6Bytes,
  MacAddress,
} from './helpers'
import { setupRaydium } from './raydium'
import { getDawnProgram } from '../dawn/utils'
import { createAccounts, USDC_DECIMALS } from './mock'

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

  const poolIpV4: IpV4Bytes = [11, 11, 11, 1]
  const poolIpV4CidrMask = 24
  const poolIpV6: IpV6Bytes = [
    0x2001, 0xdb8, 0x85a3, 0x0000, 0x0000, 0x8a2e, 0x0370, 0x7334,
  ]
  const poolIpV6CidrMask = 64

  const [ipPoolPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('ip_pool'),
      Buffer.from(poolIpV4),
      Buffer.from([poolIpV4CidrMask]),
      Buffer.from(poolIpV6.map((byte) => new BN(byte).toArray('le', 2)).flat()),
      Buffer.from([poolIpV6CidrMask]),
    ],
    program.programId,
  )

  const deviceType = { router: {} }
  const deviceManufacturer = 'MikroTik'
  const deviceModel = 'GG69420'
  const deviceMacAddress: MacAddress = [0, 0, 0, 0, 0, 0]
  const deviceLatitude = new BN(0.0000000001).mul(COORD_DENOMINATOR)
  const deviceLongitude = new BN(0.0000000001).mul(COORD_DENOMINATOR)

  const [deviceModelPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device_model'),
      deviceTypeSeed(deviceType),
      Buffer.from(deviceManufacturer),
      Buffer.from(deviceModel),
    ],
    program.programId,
  )

  const [devicePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('device'),
      Buffer.from(serviceProvider.publicKey.toBytes()),
      Buffer.from(deviceModelPda.toBytes()),
      Buffer.from(deviceMacAddress),
    ],
    program.programId,
  )

  const [deviceLocationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('device_location'), Buffer.from(devicePda.toBytes())],
    program.programId,
  )

  const leaseIpV4: IpV4Bytes = [11, 11, 11, 11]
  const leaseIpV4CidrMask = 32
  const leaseIpV6: IpV6Bytes = [
    0x2001, 0xdb8, 0x85a3, 0x0000, 0x0000, 0x8a2e, 0x0370, 0x7334,
  ]
  const leaseIpV6CidrMask = 64

  const [ipLeasePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('ip_lease'),
      Buffer.from(devicePda.toBytes()),
      Buffer.from(leaseIpV4),
      Buffer.from([leaseIpV4CidrMask]),
      Buffer.from(
        leaseIpV6.map((byte) => new BN(byte).toArray('le', 2)).flat(),
      ),
      Buffer.from([leaseIpV6CidrMask]),
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
    ipPoolPda,
    deviceModelPda,
    devicePda,
    ipLeasePda,
    deviceLocationPda,
    planPda,
    planBump,
    // ip pool
    poolIpV4,
    poolIpV4CidrMask,
    poolIpV6,
    poolIpV6CidrMask,
    leaseIpV4,
    leaseIpV4CidrMask,
    leaseIpV6,
    leaseIpV6CidrMask,
    // device
    deviceType,
    deviceManufacturer,
    deviceModel,
    deviceLatitude,
    deviceLongitude,
    deviceMacAddress,
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
