import fs from 'fs'
import path from 'path'
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
import nacl from 'tweetnacl'

import { Mock } from './types'
import { COORD_DENOMINATOR, MacAddress, PROGRAM_ID } from './helpers'
import {
  RAYDIUM_CONFIG,
  RAYDIUM_POOL_FEE_RECEIVER,
  RAYDIUM_PROGRAM_ID,
  setupRaydium,
} from '../integrations/raydium'
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
  getSubscriberIpLeasePda,
  getIpRegistryPda,
} from '../pda'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { createPSKMethodParams, serializePSKMethodParams } from './auth'
import { getPskAuthMethodPda } from '../pda/amf'

export const USD_DECIMALS = new BN(10).pow(new BN(6))

export const METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
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
      {
        name: 'meta',
        programId: METADATA_PROGRAM_ID,
      },
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
export function loadWallet(walletFile?: string): anchor.Wallet {
  let walletPath: string

  if (walletFile) {
    // Check if it's a full path (contains '/' or starts with absolute path indicators)
    if (walletFile.startsWith('/') || walletFile.includes('/')) {
      walletPath = walletFile
    } else {
      // It's a filename, look in custom-wallets folder
      const customWalletsPath = path.join(process.cwd(), 'custom-wallets', walletFile)
      if (fs.existsSync(customWalletsPath)) {
        walletPath = customWalletsPath
      } else {
        // Fallback to default location if not found in custom-wallets
        walletPath = `${require('os').homedir()}/.config/solana/${walletFile}`
      }
    }
  } else {
    // Default to the standard Solana wallet location
    walletPath = `${require('os').homedir()}/.config/solana/id.json`
  }

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
    info: raydiumConfig as any,
  })

  // Add Raydium pool fee receiver account
  const raydiumPoolFeeReceiver = await connection.getAccountInfo(
    RAYDIUM_POOL_FEE_RECEIVER,
  )
  addedAccounts.push({
    address: RAYDIUM_POOL_FEE_RECEIVER,
    info: raydiumPoolFeeReceiver as any,
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

  // Mint test USD.tel token
  console.log('Minting test USD.tel token...')
  const stableMint = await createMint(
    provider.context.banksClient, // Banks client
    wallet, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USD.tel)
  )
  // Get DAWN token PDA
  console.log('Getting DAWN token PDA...')
  const dawnMint = PublicKey.findProgramAddressSync(
    [Buffer.from('dawn')],
    PROGRAM_ID,
  )[0]

  console.log({
    stable_mint: stableMint.toBase58(),
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

  // Create USD.tel account for Service Provider
  console.log('Creating USD.tel account for Service Provider...')
  const serviceProviderStableAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    serviceProvider,
    stableMint,
    serviceProvider.publicKey,
  )

  // Create USD.tel account for Tester
  console.log('Creating USD.tel account for Tester...')
  const customerStableAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    customer,
    stableMint,
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

  // Create USD.tel token account for wallet
  console.log('Creating USD.tel token account for wallet...')
  const walletStableAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    wallet,
    stableMint,
    wallet.publicKey,
  )

  // Mint 1_000_000 USD.tel to wallet
  console.log('Minting 1_000_000 USD.tel to wallet...')
  await mintTo(
    provider.context.banksClient, // Banks client
    wallet, // Payer for transaction
    stableMint, // Mint
    walletStableAccount, // Token account
    wallet, // Mint authority
    BigInt(1_000_000_000_000), // 6 decimals
  )

  const { raydium, config, pool, auth, obs, dawnVault, stableVault } =
    await setupRaydium(
      provider,
      wallet,
      dawnMint,
      stableMint,
      walletDawnAccount,
      walletStableAccount,
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
  // AccessDomain redesign: addressed by (owner, hash(name)). Mock uses
  // a deterministic SSID label so re-runs produce a stable PDA.
  const accessDomainName = 'DawnTestNetwork'
  const accessDomainPda = getAccessDomainPda(
    program,
    serviceProvider.publicKey,
    accessDomainName,
  )
  const deviceLocationPda = getDeviceLocationPda(program, devicePda)
  const localDomainPda = getLocalDomainPda(
    program,
    serviceProvider.publicKey,
    localDomain,
  )

  const slaThreshold = new BN(100).mul(USD_DECIMALS)
  const slaPayoutRatio = new BN(100)

  const serviceAgreementPda = getServiceAgreementPda(
    program,
    slaThreshold,
    slaPayoutRatio,
  )

  const planName = 'RapidLink Elite'
  const planPrice = new BN(100).mul(USD_DECIMALS)
  const planDuration = 30
  const planSpeed = 1_000
  const planCapacity = new BN(1000)

  // Schema migration: AuthMethod no longer carries an encryption_key
  // (sealed payloads now decrypt via control_plane_device.owner).
  // We retain the local mock keypair for tests that still need a
  // recipient pubkey to seal against, but it is NOT stored on chain.
  const encryptionKey = nacl.box.keyPair().publicKey

  // Create PSK method parameters
  const params = createPSKMethodParams({
    ssid: 'DawnTestNetwork',
    securityStandard: 'WPA3_PSK',
    encryptionAlgorithm: 'AES_GCMP',
    pskRotationInterval: 86400, // 24 hours
  })
  const parametersBuffer = serializePSKMethodParams(params)
  // AuthMethod PDA is now keyed on (access_domain, method_type).
  const [pskAuthMethodPda] = getPskAuthMethodPda(program, accessDomainPda)
  const planAuthMethods = [pskAuthMethodPda]

  const [planPda, planBump] = getPlanPda(
    program,
    serviceProvider.publicKey,
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

  // Create USD.tel vault token account for plan escrow
  console.log('Creating USD.tel vault token account for plan escrow...')
  const escrowStableVault = await createAssociatedTokenAccount(
    provider.context.banksClient,
    serviceProvider,
    stableMint,
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
  const ipLeasePda = getSubscriberIpLeasePda(subscriptionPda)

  mock = {
    serviceProvider,
    customer,
    // mints
    stableMint,
    dawnMint,
    // token accounts
    feePoolDawnAccount,
    daoDawnAccount,
    validatorDawnAccount,
    medallionDawnAccount,
    serviceProviderDawnAccount,
    serviceProviderStableAccount,
    customerDawnAccount,
    customerStableAccount,
    walletDawnAccount,
    walletStableAccount,
    escrowDawnVault,
    escrowStableVault,
    // raydium
    raydium,
    raydiumConfig: config,
    raydiumAuthority: auth,
    raydiumPool: pool,
    raydiumObservation: obs,
    raydiumDawnVault: dawnVault,
    raydiumStableVault: stableVault,
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
