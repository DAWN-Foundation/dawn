import fs from 'fs'
import * as anchor from '@coral-xyz/anchor'
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import { AddedAccount, startAnchor } from 'solana-bankrun'
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from 'spl-token-bankrun'

import { Mock } from './types'
import {
  COORD_DENOMINATOR,
  deviceTypeSeed,
  IpV4Bytes,
  IpV6Bytes,
  MacAddress,
  PROGRAM_ID,
} from './helpers'
import {
  RAYDIUM_CONFIG,
  RAYDIUM_POOL_FEE_RECEIVER,
  RAYDIUM_PROGRAM_ID,
  setupRaydium,
} from './raydium'
import { getDawnProgram } from '../dawn/utils'
import {
  getConfigPda,
  getDeviceLocationPda,
  getDeviceModelPda,
  getDevicePda,
  getIpLeasePda,
  getIpPoolPda,
  getPlanPda,
  getSubscriptionPda,
  getTokenConfigPda,
} from './pda'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

export const USDC_DECIMALS = new BN(10).pow(new BN(6))

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
    .accounts({
      caller: wallet.publicKey,
      tokenConfig: tokenConfigPda,
      dawnMint: dawnMint,
      callerDawnAccount: walletDawnAccount,
    })
    .signers([wallet])
    .rpc()

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
  const [sitePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('site'),
      Buffer.from(serviceProvider.publicKey.toBytes()),
      Buffer.from(siteName),
    ],
    program.programId,
  )

  const deviceType = { router: {} }
  const deviceManufacturer = 'MikroTik'
  const deviceModel = 'GG69420'
  const deviceMacAddress: MacAddress = [0, 0, 0, 0, 0, 0]

  const deviceModelPda = getDeviceModelPda(
    program,
    deviceType,
    deviceManufacturer,
    deviceModel,
  )

  const deviceLatitude = new BN(1.0 * COORD_DENOMINATOR)
  const deviceLongitude = new BN(1.0 * COORD_DENOMINATOR)
  const deviceHeight = 1

  const devicePda = getDevicePda(
    program,
    serviceProvider,
    deviceModelPda,
    deviceMacAddress,
  )

  const deviceLocationPda = getDeviceLocationPda(program, devicePda)

  // Pool IP V4
  const poolIpV4: IpV4Bytes = [11, 11, 11, 0]
  const poolIpV4CidrMask = 24

  // Pool IP V6 (2001:db8::/64 - a documentation prefix)
  const poolIpV6: IpV6Bytes = [
    0x2001, 0x0db8, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
  ]
  const poolIpV6CidrMask = 64

  const [ipPoolPda] = getIpPoolPda(
    program,
    poolIpV4,
    poolIpV4CidrMask,
    poolIpV6,
    poolIpV6CidrMask,
  )

  // Lease IP V4
  const leaseIpV4: IpV4Bytes = [11, 11, 11, 2]
  const leaseIpV4CidrMask = 32

  // Lease IP V6 (2001:db8::1 - a valid address within the pool)
  const leaseIpV6: IpV6Bytes = [
    0x2001, 0x0db8, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0001,
  ]
  const leaseIpV6CidrMask = 128 // Single address

  const [ipLeasePda] = getIpLeasePda(
    program,
    devicePda,
    ipPoolPda,
    leaseIpV4,
    leaseIpV4CidrMask,
    leaseIpV6,
    leaseIpV6CidrMask,
  )

  const planPrice = new BN(100).mul(USDC_DECIMALS)
  const planDuration = 30
  const planSpeed = 1_000
  const planCapacity = new BN(1000)
  const planSlaId = new BN(1)

  const [planPda, planBump] = getPlanPda(
    program,
    devicePda,
    null,
    planPrice,
    planDuration,
    planSpeed,
    planCapacity,
    null,
    planSlaId,
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
    tokenConfigPda,
    configPda,
    ipPoolPda,
    deviceModelPda,
    sitePda,
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
    // site
    siteName,
    // device
    deviceType,
    deviceManufacturer,
    deviceModel,
    deviceLatitude,
    deviceLongitude,
    deviceHeight,
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

  return mock
}
