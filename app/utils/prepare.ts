import { AnchorProvider, BN, IdlTypes } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token'

import { Mock } from './types'
import {
  COORD_DENOMINATOR,
  deviceTypeSeed,
  fund,
  IpV4Bytes,
  IpV6Bytes,
  MacAddress,
  PROGRAM_ID,
  AuthMethod,
} from './helpers'
import { mock } from './mock'
import { setupRaydium } from './raydium'
import { getDawnProgram } from '../dawn/utils'
import { createAccounts, USDC_DECIMALS } from './mock'
import {
  getAccessDomainPda,
  getConfigPda,
  getDaoDawnAccountPda,
  getDeviceLocationPda,
  getDeviceModelPda,
  getDevicePda,
  getFeePoolDawnAccountPda,
  getIpLeasePda,
  getIpPoolPda,
  getMedallionDawnAccountPda,
  getPlanPda,
  getServiceAgreementPda,
  getSubscriptionPda,
  getTokenConfigPda,
  getValidatorDawnAccountPda,
} from './pda'
import { getSitePda } from './pda/site'

async function fundAccounts(
  provider: AnchorProvider,
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
}

// Prepares the local validator for testnet simulation
// Creates all necessary accounts and mints tokens
// Only run once in `testnet` script for validator setup
export async function prepare(
  provider: AnchorProvider,
  accounts: Awaited<ReturnType<typeof createAccounts>>,
  isDevnet: boolean = false,
): Promise<Mock> {
  const {
    wallet,
    dao,
    validatorPool,
    medallionPool,
    serviceProvider,
    customer,
  } = accounts

  if (!isDevnet) {
    await fundAccounts(provider, accounts)
  }

  // Mint test USDC token
  console.log('Minting test USDC token...')
  const usdcMint = await createMint(
    provider.connection,
    wallet, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USDC)
  )

  // Get DAWN token PDA
  console.log('Getting DAWN token PDA...')
  const dawnMint = PublicKey.findProgramAddressSync(
    [Buffer.from('dawn')],
    PROGRAM_ID,
  )[0]

  console.log({
    usdc_mint: usdcMint.toBase58(),
    dawn_mint: dawnMint.toBase58(),
  })

  const program = getDawnProgram(provider)

  const tokenConfigPda = getTokenConfigPda(program)

  // derive associated DAWN token account for wallet
  const walletDawnAccount = await getAssociatedTokenAddress(
    dawnMint,
    wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )

  // Initialize DAWN token
  console.log('Initializing DAWN token...')
  await program.methods
    .initToken()
    .accounts({
      caller: wallet.publicKey,
      tokenConfig: tokenConfigPda,
      dawnMint: dawnMint,
      callerDawnAccount: walletDawnAccount,
    })
    .signers([wallet])
    .rpc()

  // get fee pool DAWN account PDA
  const feePoolDawnAccount = getFeePoolDawnAccountPda(program)

  // get DAO DAWN account PDA
  const daoDawnAccount = getDaoDawnAccountPda(program)

  // get Validator DAWN account PDA
  const validatorDawnAccount = getValidatorDawnAccountPda(program)

  // get Medallion DAWN account PDA
  const medallionDawnAccount = getMedallionDawnAccountPda(program)

  // Create DAWN account for Service Provider
  console.log('Creating DAWN account for Service Provider...')
  const { address: serviceProviderDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      isDevnet ? wallet : serviceProvider,
      dawnMint,
      serviceProvider.publicKey,
    )

  // Create USDC account for Service Provider
  console.log('Creating USDC account for Service Provider...')
  const { address: serviceProviderUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet,
      usdcMint,
      serviceProvider.publicKey,
    )

  // Create USDC account for Customer
  console.log('Creating USDC account for Customer...')
  const { address: customerUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      isDevnet ? wallet : customer,
      usdcMint,
      customer.publicKey,
    )

  // Create DAWN token account for Customer
  console.log('Creating DAWN token account for Customer...')
  const { address: customerDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      isDevnet ? wallet : customer,
      dawnMint,
      customer.publicKey,
    )

  // Create USDC token account for wallet
  console.log('Creating USDC token account for wallet...')
  const { address: walletUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      isDevnet ? wallet : wallet,
      usdcMint,
      wallet.publicKey,
      true,
      'finalized',
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

  const [configPda] = getConfigPda(program)

  const siteName = 'Test Site'
  const sitePda = getSitePda(program, serviceProvider, siteName)

  const poolIpV4: IpV4Bytes = [11, 11, 11, 1]
  const poolIpV4CidrMask = 24
  const poolIpV6: IpV6Bytes = [
    0x2001, 0xdb8, 0x85a3, 0x0000, 0x0000, 0x8a2e, 0x0370, 0x7334,
  ]
  const poolIpV6CidrMask = 64

  const [ipPoolPda] = getIpPoolPda(
    program,
    poolIpV4,
    poolIpV4CidrMask,
    poolIpV6,
    poolIpV6CidrMask,
  )

  const deviceType = { router: {} }
  const deviceManufacturer = 'MikroTik'
  const deviceModel = 'GG69420'
  const deviceName = 'PreparedDevice'
  const deviceMacAddress: MacAddress = [0, 0, 0, 0, 0, 0]
  const deviceLatitude = new BN(0.000001 * COORD_DENOMINATOR)
  const deviceLongitude = new BN(0.000001 * COORD_DENOMINATOR)
  const deviceHeight = 1

  const deviceModelPda = getDeviceModelPda(
    program,
    deviceType,
    deviceManufacturer,
    deviceModel,
  )

  const devicePda = getDevicePda(
    program,
    serviceProvider,
    deviceModelPda,
    deviceName,
    deviceMacAddress,
  )
  const accessDomainPda = getAccessDomainPda(program, devicePda)
  const deviceLocationPda = getDeviceLocationPda(program, devicePda)

  const leaseIpV4: IpV4Bytes = [11, 11, 11, 11]
  const leaseIpV4CidrMask = 32
  const leaseIpV6: IpV6Bytes = [
    0x2001, 0xdb8, 0x85a3, 0x0000, 0x0000, 0x8a2e, 0x0370, 0x7334,
  ]
  const leaseIpV6CidrMask = 64

  const [ipLeasePda] = getIpLeasePda(
    program,
    devicePda,
    ipPoolPda,
    leaseIpV4,
    leaseIpV4CidrMask,
    leaseIpV6,
    leaseIpV6CidrMask,
  )

  const slaThreshold = new BN(100).mul(USDC_DECIMALS)
  const slaPayoutRatio = new BN(100)

  const serviceAgreementPda = getServiceAgreementPda(
    program,
    slaThreshold,
    slaPayoutRatio,
  )

  const planName = 'RapidLink Elite'
  const planPrice = new BN(100).mul(USDC_DECIMALS)
  const planDuration = 30
  const planSpeed = 1_000
  const planCapacity = new BN(1000)
  const planAuthMethods: AuthMethod[] = [{ mpsk: {} }]

  const [planPda, planBump] = getPlanPda(
    program,
    accessDomainPda,
    devicePda,
    null,
    planName,
    planPrice,
    planDuration,
    planSpeed,
    planCapacity,
    null,
    serviceAgreementPda,
  )

  const [subscriptionPda, subscriptionBump] = getSubscriptionPda(
    program,
    planPda,
    customer,
  )

  // Create USDC vault token account for plan escrow
  console.log('Creating USDC vault token account for plan escrow...')
  const { address: escrowUsdcVault } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    isDevnet ? wallet : serviceProvider,
    usdcMint,
    planPda,
    true,
  )

  // Create DAWN vault token account for plan escrow
  console.log('Creating DAWN vault token account for plan escrow...')
  const { address: escrowDawnVault } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    isDevnet ? wallet : serviceProvider,
    dawnMint,
    planPda,
    true,
  )

  return {
    serviceProvider,
    customer,
    // mints
    usdcMint,
    dawnMint,
    // token accounts
    feePoolDawnAccount,
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
    tokenConfigPda,
    configPda,
    ipPoolPda,
    deviceModelPda,
    accessDomainPda,
    sitePda,
    devicePda,
    ipLeasePda,
    deviceLocationPda,
    serviceAgreementPda,
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
    // site
    siteName,
    // device
    deviceType,
    deviceManufacturer,
    deviceModel,
    deviceName,
    deviceLatitude,
    deviceLongitude,
    deviceHeight,
    deviceMacAddress,
    // service agreement
    slaThreshold,
    slaPayoutRatio,
    // plan
    planName,
    planPrice,
    planDuration,
    planSpeed,
    planCapacity,
    planAuthMethods,
    // subscription
    subscriptionPda,
    subscriptionBump,
  }
}
