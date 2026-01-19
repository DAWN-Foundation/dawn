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
  getAssociatedTokenAddressSync,
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
  AuthMethodType,
} from './helpers'
import { mock } from './mock'
import { setupRaydium } from '../integrations/raydium'
import { getDawnProgram } from '../../cli/shared/cli-utils'
import { createAccounts, USDC_DECIMALS } from './mock'
import {
  getDistributionDomainPda,
  getAccessDomainPda,
  getConfigPda,
  getDaoDawnAccountPda,
  getDeviceLocationPda,
  getDeviceModelPda,
  getDevicePda,
  getFeePoolDawnAccountPda,
  getIpBlockPda,
  getRootIpBlockPda,
  getLocalDomainPda,
  getMedallionDawnAccountPda,
  getPlanPda,
  getServiceAgreementPda,
  getSubscriptionPda,
  getTokenConfigPda,
  getValidatorDawnAccountPda,
  getIpLeasePda,
  getSubscriberIpLeasePda,
  getIpRegistryPda,
} from '../pda'

async function fundAccounts(
  provider: AnchorProvider,
  accounts: Awaited<ReturnType<typeof createAccounts>>,
) {
  const { wallet, serviceProvider, customer } = accounts

  // Fund wallet
  console.log('Funding wallet...')
  await fund(provider.connection, wallet.publicKey, 1000)

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
  const { wallet, serviceProvider, customer } = accounts

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
    undefined,
    { commitment: 'finalized' },
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
  )

  // Initialize DAWN token
  console.log('Initializing DAWN token...')
  await program.methods
    .initToken()
    .accountsPartial({
      caller: wallet.publicKey,
      tokenConfig: tokenConfigPda,
      dawnMint: dawnMint,
      callerDawnAccount: walletDawnAccount,
    })
    .signers([wallet])
    .rpc({ commitment: 'finalized' })

  // Get fee pool DAWN account PDA
  const feePoolDawnAccount = getFeePoolDawnAccountPda(program)

  // Get DAO DAWN account PDA
  const daoDawnAccount = getDaoDawnAccountPda(program)

  // Get Validator DAWN account PDA
  const validatorDawnAccount = getValidatorDawnAccountPda(program)

  // Get Medallion DAWN account PDA
  const medallionDawnAccount = getMedallionDawnAccountPda(program)

  // Initialize fee accounts
  console.log('Initializing fee accounts...')
  await program.methods
    .initFeeAccounts()
    .accountsPartial({
      caller: wallet.publicKey,
      tokenConfig: tokenConfigPda,
      dawnMint,
      feePoolDawnAccount,
      daoDawnAccount,
      validatorDawnAccount,
      medallionDawnAccount,
    })
    .signers([wallet])
    .rpc({ commitment: 'finalized' })

  // Create DAWN account for Service Provider
  console.log('Creating DAWN account for Service Provider...')
  const serviceProviderDawnAccount = await createAssociatedTokenAccount(
    provider.connection,
    wallet,
    dawnMint,
    serviceProvider.publicKey,
    { commitment: 'finalized', skipPreflight: true },
  )

  // Create USDC account for Service Provider
  console.log('Creating USDC account for Service Provider...')
  const serviceProviderUsdcAccount = await createAssociatedTokenAccount(
    provider.connection,
    wallet,
    usdcMint,
    serviceProvider.publicKey,
    { commitment: 'finalized', skipPreflight: true },
  )

  // Create USDC account for Customer
  console.log('Creating USDC account for Customer...')
  const customerUsdcAccount = await createAssociatedTokenAccount(
    provider.connection,
    wallet,
    usdcMint,
    customer.publicKey,
    { commitment: 'finalized', skipPreflight: true },
  )

  // Create DAWN token account for Customer
  console.log('Creating DAWN token account for Customer...')
  const customerDawnAccount = await createAssociatedTokenAccount(
    provider.connection,
    wallet,
    dawnMint,
    customer.publicKey,
    { commitment: 'finalized', skipPreflight: true },
  )

  // create USDC token account for wallet
  console.log('Creating USDC token account for wallet...')
  const walletUsdcAccount = await createAssociatedTokenAccount(
    provider.connection,
    wallet,
    usdcMint,
    wallet.publicKey,
    { commitment: 'finalized', skipPreflight: true },
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
    undefined,
    { commitment: 'finalized', skipPreflight: true },
  )

  console.log('Setting up Raydium...')
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

  const deviceType = { router: {} }
  const deviceManufacturer = 'MikroTik'
  const deviceModel = 'GG69420'
  const deviceName = 'PreparedDevice'
  const deviceMacAddress: MacAddress = [0, 0, 0, 0, 0, 0]
  const deviceLatitude = new BN(0.000001 * COORD_DENOMINATOR)
  const deviceLongitude = new BN(0.000001 * COORD_DENOMINATOR)
  const devicePlacement: [number, number] = [0, 0]
  const deviceHeight = 1
  const localDomain = 'local-domain'

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

  const deviceTypeL2 = { wirelessRadio: {} }
  const deviceManufacturerL2 = 'DAWN'
  const deviceModelL2 = 'WirelessRadio'
  const deviceNameL2 = 'WirelessRadio'
  const deviceMacAddressL2: MacAddress = [0, 0, 0, 0, 0, 1]

  const deviceL2ModelPda = getDeviceModelPda(
    program,
    deviceTypeL2,
    deviceManufacturerL2,
    deviceModelL2,
  )

  const deviceL2Pda = getDevicePda(
    program,
    customer,
    deviceL2ModelPda,
    deviceNameL2,
    deviceMacAddressL2,
  )

  const distributionDomainPda = getDistributionDomainPda(program, devicePda)
  const accessDomainPda = getAccessDomainPda(program, devicePda)
  const deviceLocationPda = getDeviceLocationPda(program, devicePda)
  const localDomainPda = getLocalDomainPda(
    program,
    serviceProvider.publicKey,
    localDomain,
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
  const planAuthMethods: PublicKey[] = []

  const [planPda, planBump] = getPlanPda(
    program,
    localDomainPda,
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
  const escrowUsdcVault = await createAssociatedTokenAccount(
    provider.connection,
    isDevnet ? wallet : serviceProvider,
    usdcMint,
    planPda,
    { commitment: 'finalized', skipPreflight: true },
    undefined,
    undefined,
    true,
  )

  // Create DAWN vault token account for plan escrow
  console.log('Creating DAWN vault token account for plan escrow...')
  const escrowDawnVault = await createAssociatedTokenAccount(
    provider.connection,
    isDevnet ? wallet : serviceProvider,
    dawnMint,
    planPda,
    { commitment: 'finalized', skipPreflight: true },
    undefined,
    undefined,
    true,
  )

  // IPAM
  const loopIpRegistryPda = getIpRegistryPda(1)
  const rootSubscriberIpBlockPda = getRootIpBlockPda(0, 0)
  const ipBlockPda = getIpBlockPda(rootSubscriberIpBlockPda, 0)
  const ipLeasePda = getSubscriberIpLeasePda(subscriptionPda)

  const ptpIpRegistryPda = getIpRegistryPda(2)
  const rootLoopbackIpBlockPda = getRootIpBlockPda(1, 0)
  const loopbackIpBlockPda = getIpBlockPda(rootLoopbackIpBlockPda, 0)
  const loopbackIpLeasePda = getIpLeasePda(1, devicePda)

  const subscriberIpRegistryPda = getIpRegistryPda(0)
  const rootPtpIpBlockPda = getRootIpBlockPda(2, 0)
  const ptpIpBlockPda = getIpBlockPda(rootPtpIpBlockPda, 0)
  const ptpIpLeasePda = getIpLeasePda(2, deviceL2Pda)

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
    deviceModelPda,
    deviceL2ModelPda,
    distributionDomainPda,
    accessDomainPda,
    localDomainPda,
    devicePda,
    deviceL2Pda,
    deviceLocationPda,
    serviceAgreementPda,
    planPda,
    planBump,
    // IPAM
    loopIpRegistryPda,
    ptpIpRegistryPda,
    subscriberIpRegistryPda,
    rootSubscriberIpBlockPda,
    ipBlockPda,
    ipLeasePda,
    rootLoopbackIpBlockPda,
    loopbackIpBlockPda,
    loopbackIpLeasePda,
    rootPtpIpBlockPda,
    ptpIpBlockPda,
    ptpIpLeasePda,
    // device
    deviceType,
    deviceManufacturer,
    deviceModel,
    deviceName,
    deviceLatitude,
    deviceLongitude,
    devicePlacement,
    deviceHeight,
    deviceMacAddress,
    localDomain,
    deviceTypeL2,
    deviceManufacturerL2,
    deviceModelL2,
    deviceNameL2,
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
