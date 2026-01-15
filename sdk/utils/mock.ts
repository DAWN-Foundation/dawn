import fs from 'fs'
import * as anchor from '@coral-xyz/anchor'
import { BN, Wallet } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import { AddedAccount, startAnchor } from 'solana-bankrun'
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from 'spl-token-bankrun'

import { Mock } from './types'
import { COORD_DENOMINATOR, MacAddress, PROGRAM_ID } from './helpers'
import {
  RAYDIUM_CONFIG,
  RAYDIUM_POOL_FEE_RECEIVER,
  RAYDIUM_PROGRAM_ID,
  setupRaydium,
} from '../integrations/raydium'

// Data Anchor Blober program ID (exported for tests)
export const BLOBER_PROGRAM_ID = new PublicKey(
  'anchorE4RzhiFx3TEFep6yRNK9igZBzMVWziqjbGHp2',
)
import { getDawnProgram } from '../../cli/shared/cli-utils'
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
  getIpRegistryPda,
} from '../pda'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { createPSKMethodParams, serializePSKMethodParams } from './auth'
import { getPskAuthMethodPda } from '../pda/amf'

export const USDC_DECIMALS = new BN(10).pow(new BN(6))

export let mock: Mock
let provider: BankrunProvider

// PoB program ID
export const POB_PROGRAM_ID = new PublicKey(
  'PoBrUKPnS6aHnXpAgtQYnLK7mQzFGF5ktk6CrXA9b8N',
)

export async function getProvider(accounts?: AddedAccount[]) {
  if (provider) return provider
  const context = await startAnchor(
    '.',
    [
      { name: 'dawn', programId: PROGRAM_ID },
      { name: 'pob', programId: POB_PROGRAM_ID },
      { name: 'raydium', programId: RAYDIUM_PROGRAM_ID },
      { name: 'blober', programId: BLOBER_PROGRAM_ID },
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

  // Create Service Provider KeyPair
  console.log('Creating Service Provider KeyPair...')
  const serviceProvider = Keypair.generate()

  // Create Tester KeyPair
  console.log('Creating Tester KeyPair...')
  const customer = Keypair.generate()

  const newAccounts = {
    wallet,
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
  const { wallet, serviceProvider, customer } = accounts

  // Mint test USDC token
  console.log('Minting test USDC token...')
  const usdcMint = await createMint(
    provider.context.banksClient, // Banks client
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

  provider.wallet = new Wallet(wallet)
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
    .accountsPartial({
      caller: wallet.publicKey,
      tokenConfig: tokenConfigPda,
      dawnMint: dawnMint,
      callerDawnAccount: walletDawnAccount,
    })
    .signers([wallet])
    .rpc()

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
    .rpc()

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
    wallet, // Mint authority
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

  const deviceType = { router: {} }
  const deviceManufacturer = 'MikroTik'
  const deviceModel = 'GG69420'
  const deviceName = 'DefaultDevice'
  const deviceMacAddress: MacAddress = [0, 0, 0, 0, 0, 0]
  const localDomain = 'local-domain'

  const deviceModelPda = getDeviceModelPda(
    program,
    deviceType,
    deviceManufacturer,
    deviceModel,
  )

  const deviceLatitude = new BN(1.0 * COORD_DENOMINATOR)
  const deviceLongitude = new BN(1.0 * COORD_DENOMINATOR)
  const devicePlacement: [number, number] = [0, 0]
  const deviceHeight = 1

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
  const deviceMacAddressL2: MacAddress = [0, 0, 0, 0, 0, 1]
  const deviceNameL2 = 'WirelessRadio'

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

  // Create PSK method parameters
  const params = createPSKMethodParams({
    ssid: 'DawnTestNetwork',
    securityStandard: 'WPA3_PSK',
    encryptionAlgorithm: 'AES_GCMP',
    pskRotationInterval: 86400, // 24 hours
  })
  const parametersBuffer = serializePSKMethodParams(params)
  const [pskAuthMethodPda] = getPskAuthMethodPda(
    program,
    serviceProvider.publicKey,
    parametersBuffer,
  )
  const planAuthMethods = [pskAuthMethodPda]

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
    provider.context.banksClient,
    serviceProvider,
    usdcMint,
    planPda,
  )

  // Create DAWN vault token account for plan escrow
  console.log('Creating DAWN vault token account for plan escrow...')
  const escrowDawnVault = await createAssociatedTokenAccount(
    provider.context.banksClient,
    serviceProvider,
    dawnMint,
    planPda,
  )

  // IPAM - Loopback tier (tier 1)
  const loopIpRegistryPda = getIpRegistryPda(1)
  const rootLoopbackIpBlockPda = getRootIpBlockPda(1, 0)
  const loopbackIpBlockPda = getIpBlockPda(rootLoopbackIpBlockPda, 0)
  const loopbackIpLeasePda = getIpLeasePda(1, devicePda)

  // IPAM - PtP tier (tier 2) for WirelessRadio devices
  const ptpIpRegistryPda = getIpRegistryPda(2)
  const rootPtpIpBlockPda = getRootIpBlockPda(2, 0)
  const ptpIpBlockPda = getIpBlockPda(rootPtpIpBlockPda, 0)
  const ptpIpLeasePda = getIpLeasePda(2, deviceL2Pda)

  // IPAM - Subscriber tier (tier 0) for future use
  const subscriberIpRegistryPda = getIpRegistryPda(0)
  const rootSubscriberIpBlockPda = getRootIpBlockPda(0, 0)
  const ipBlockPda = getIpBlockPda(rootSubscriberIpBlockPda, 0)
  const ipLeasePda = getIpLeasePda(0, devicePda)

  mock = {
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
    // ipPoolPda,
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
    // IPAM - IP blocks and leases
    loopIpRegistryPda,
    ptpIpRegistryPda,
    subscriberIpRegistryPda,
    rootLoopbackIpBlockPda,
    loopbackIpBlockPda,
    loopbackIpLeasePda,
    rootPtpIpBlockPda,
    ptpIpBlockPda,
    ptpIpLeasePda,
    rootSubscriberIpBlockPda,
    ipBlockPda,
    ipLeasePda,
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

  return mock
}
