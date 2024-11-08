import fs from 'fs'
import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import {
  AccountInfo,
  Connection,
  GetProgramAccountsResponse,
  Keypair,
  PublicKey,
  Signer,
  Transaction,
} from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import {
  Account,
  createMintToInstruction,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { AddedAccount, BanksClient, startAnchor } from 'solana-bankrun'
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from 'spl-token-bankrun'

import { Mock } from './types'
import { fund } from './helpers'
import { setupRaydium } from './raydium'
import { getDawnProgram } from '../dawn/utils'

export const PROGRAM_ID = new PublicKey(
  'dawn111111111111111111111111111111111111111',
)

export const RAYDIUM_PROGRAM_ID = new PublicKey(
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
)

type Acc = {
  account: AccountInfo<Buffer>
  pubkey: PublicKey
}

export const RAYDIUM_CONFIG = new PublicKey(
  'D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2',
)

export const RAYDIUM_POOL_FEE_RECEIVER = new PublicKey(
  'DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8',
)

// async function mintTo(
//   banksClient: BanksClient,
//   payer: Signer,
//   mint: PublicKey,
//   destination: PublicKey,
//   authorityPublicKey: PublicKey,
//   amount: bigint,
// ) {
//   console.log({
//     mint,
//     destination,
//     authorityPublicKey,
//   })
//   const tx = new Transaction().add(
//     createMintToInstruction(
//       mint,
//       destination,
//       authorityPublicKey,
//       amount,
//       [],
//       TOKEN_PROGRAM_ID,
//     ),
//   )
//   ;[tx.recentBlockhash] = (await banksClient.getLatestBlockhash())!
//   tx.sign(payer)

//   return await banksClient.processTransaction(tx)
// }

export let mock: Mock
let provider: BankrunProvider
let client: BanksClient

export async function getProvider(accounts?: AddedAccount[]) {
  if (provider) {
    console.log('Using existing provider')
    return provider
  }
  console.log({ accounts })
  const context = await startAnchor(
    '.',
    [
      { name: 'dawn', programId: PROGRAM_ID },
      { name: 'raydium', programId: RAYDIUM_PROGRAM_ID },
    ],
    accounts ?? [],
  )
  provider = new BankrunProvider(context)
  client = context.banksClient
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

export async function createAccounts() {
  // // Load wallet
  // console.log('Loading local wallet...')
  // const wallet = loadWallet()

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
    // wallet,
    dao,
    validatorPool,
    medallionPool,
    provider,
    tester,
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
  isTestnet: boolean = false,
) {
  const wallet = provider.wallet

  const {
    // wallet,
    dao,
    validatorPool,
    medallionPool,
    provider: serviceProvider,
    tester,
  } = accounts

  // Mint test USDC token
  console.log('Minting test USDC token...')
  const usdcMint = await createMint(
    client, // Banks client
    wallet.payer, // Payer for transaction
    wallet.payer.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USDC)
  )
  // Mint test DAWN token
  console.log('Minting test DAWN token...')
  const dawnMint = await createMint(
    client, // Banks client
    wallet.payer, // Payer for transaction
    wallet.payer.publicKey, // Mint authority
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
    client, // Banks client
    dao, // Payer for transaction
    dawnMint, // Mint
    dao.publicKey, // Token account owner
  )

  // Create DAWN account for Validator Pool
  console.log('Creating DAWN account for Validator Pool...')
  const validatorDawnAccount = await createAssociatedTokenAccount(
    client,
    validatorPool,
    dawnMint,
    validatorPool.publicKey,
  )

  // Create DAWN account for Medallion Pool
  console.log('Creating DAWN account for Medallion Pool...')
  const medallionDawnAccount = await createAssociatedTokenAccount(
    client,
    medallionPool,
    dawnMint,
    medallionPool.publicKey,
  )

  // Create DAWN account for Service Provider
  console.log('Creating DAWN account for Service Provider...')
  const providerDawnAccount = await createAssociatedTokenAccount(
    client,
    serviceProvider,
    dawnMint,
    serviceProvider.publicKey,
  )

  // Create USDC account for Service Provider
  console.log('Creating USDC account for Service Provider...')
  const providerUsdcAccount = await createAssociatedTokenAccount(
    client,
    serviceProvider,
    usdcMint,
    serviceProvider.publicKey,
  )

  // Create USDC account for Tester
  console.log('Creating USDC account for Tester...')
  const testerUsdcAccount = await createAssociatedTokenAccount(
    client,
    tester,
    usdcMint,
    tester.publicKey,
  )

  // Create DAWN token account for Tester
  console.log('Creating DAWN token account for Tester...')
  const testerDawnAccount = await createAssociatedTokenAccount(
    client,
    tester,
    dawnMint,
    tester.publicKey,
  )

  // Create DAWN token account for wallet.payer
  console.log('Creating DAWN token account for wallet.payer...')
  const userDawnAccount = await createAssociatedTokenAccount(
    client,
    wallet.payer,
    dawnMint,
    wallet.payer.publicKey,
  )

  // Create USDC token account for wallet.payer
  console.log('Creating USDC token account for wallet.payer...')
  const userUsdcAccount = await createAssociatedTokenAccount(
    client,
    wallet.payer,
    usdcMint,
    wallet.payer.publicKey,
  )

  // Mint 1_000_000 USDC to user
  console.log('Minting 1_000_000 USDC to wallet.payer...')
  await mintTo(
    client, // Banks client
    wallet.payer, // Payer for transaction
    usdcMint, // Mint
    userUsdcAccount, // Token account
    wallet.payer.publicKey, // Mint authority
    BigInt(1_000_000_000_000), // 6 decimals
  )

  // Mint 1_000_000 DAWN to user
  console.log('Minting 1_000_000 DAWN to wallet.payer...')
  await mintTo(
    client, // Banks client
    wallet.payer, // Payer for transaction
    dawnMint, // Mint
    userDawnAccount, // Token account
    wallet.payer.publicKey, // Mint authority
    BigInt(1_000_000_000_000), // 6 decimals
  )

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
