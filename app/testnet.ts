import fs from 'fs'
import { execSync } from 'child_process'
import { Connection, Keypair } from '@solana/web3.js'
import { TestnetConfig } from './types'
import { Wallet } from '@coral-xyz/anchor'
import { createAssociatedTokenAccount, mintTo } from '@solana/spl-token'
import { setupRaydium } from './utils'

const { PublicKey } = require('@solana/web3.js')
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
} = require('@solana/spl-token')

const PROGRAM_ID = new PublicKey('79d7dzfG5hC2xCzNUrwyAdG2agBh6NM9gATyXPBr9zFq')

export function loadWallet(): Wallet {
  const walletPath = `${require('os').homedir()}/.config/solana/id.json`
  const secretKeyString = fs.readFileSync(walletPath, 'utf8')
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString))
  const keypair = Keypair.fromSecretKey(secretKey)
  return new Wallet(keypair)
}

async function fund(wallet: Keypair, checkFinalized: boolean = false) {
  const output = execSync(
    `solana airdrop --url l --commitment ${
      checkFinalized ? 'finalized' : 'confirmed'
    } 500 ${wallet.publicKey.toBase58()}`,
    {
      encoding: 'utf-8',
    },
  )
  console.log(output)
}

async function setup(connection: Connection): Promise<TestnetConfig> {
  // Get Local Wallet KeyPair
  const wallet = loadWallet()
  await fund(wallet.payer)

  // Create DAWN DAO KeyPair
  const dao = Keypair.generate()
  console.log('Creating DAWN DAO account:', dao.publicKey.toBase58())
  await fund(dao)

  // Create Validator Pool KeyPair
  const validatorPool = Keypair.generate()
  console.log(
    'Creating Validator Pool account:',
    validatorPool.publicKey.toBase58(),
  )
  await fund(validatorPool)

  // Create Medallion Pool KeyPair
  const medallionPool = Keypair.generate()
  console.log(
    'Creating Medallion Pool account:',
    medallionPool.publicKey.toBase58(),
  )
  await fund(medallionPool)

  // Create Building Owner KeyPair
  const buildingOwner = Keypair.generate()
  console.log(
    'Creating Building Owner account:',
    buildingOwner.publicKey.toBase58(),
  )
  await fund(buildingOwner)

  // Create Tester KeyPair
  const tester = Keypair.generate()
  console.log('Creating Tester account:', tester.publicKey.toBase58())
  await fund(tester, true)

  // Mint test USDC token
  console.log('Minting USDC token...')
  const usdcMint = await createMint(
    connection,
    wallet.payer, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USDC)
  )
  console.log('Minted USDC token:', usdcMint.toBase58())

  // Mint test DAWN token
  console.log('Minting DAWN token...')
  const dawnMint = await createMint(
    connection,
    wallet.payer, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    9, // Decimals (9 decimals for DAWN)
  )
  console.log('Minted DAWN token:', dawnMint.toBase58())

  // Create DAWN account for DAWN DAO
  const daoDawnAccount = await createAssociatedTokenAccount(
    connection,
    dao,
    dawnMint,
    dao.publicKey,
  )
  console.log(
    'Created DAWN token account for DAWN DAO:',
    daoDawnAccount.toBase58(),
  )

  // Create DAWN account for Validator Pool
  const validatorDawnAccount = await createAssociatedTokenAccount(
    connection,
    validatorPool,
    dawnMint,
    validatorPool.publicKey,
  )
  console.log(
    'Created DAWN token account for Validator Pool:',
    validatorDawnAccount.toBase58(),
  )

  // Create DAWN account for Medallion Pool
  const medallionDawnAccount = await createAssociatedTokenAccount(
    connection,
    medallionPool,
    dawnMint,
    medallionPool.publicKey,
  )
  console.log(
    'Created DAWN token account for Medallion Pool:',
    medallionDawnAccount.toBase58(),
  )

  // Create DAWN account for Building Owner
  const boDawnAccount = await createAssociatedTokenAccount(
    connection,
    buildingOwner,
    dawnMint,
    buildingOwner.publicKey,
  )
  console.log(
    'Created DAWN token account for Building Owner:',
    boDawnAccount.toBase58(),
  )

  // Create USDC account for Tester
  const testerUsdcAccount = await createAssociatedTokenAccount(
    connection,
    tester,
    usdcMint,
    tester.publicKey,
  )
  console.log(
    'Created USDC token account for Tester:',
    testerUsdcAccount.toBase58(),
  )

  // Create DAWN token account for wallet.payer
  const userDawnAccount = await createAssociatedTokenAccount(
    connection,
    wallet.payer,
    dawnMint,
    wallet.payer.publicKey,
  )
  console.log(
    'Created DAWN token account for wallet.payer:',
    userDawnAccount.toBase58(),
  )

  // Create USDC token account for wallet.payer
  const userUsdcAccount = await createAssociatedTokenAccount(
    connection,
    wallet.payer,
    usdcMint,
    wallet.payer.publicKey,
  )
  console.log(
    'Created USDC token account for wallet.payer:',
    userUsdcAccount.toBase58(),
  )

  // Mint 1_000_000 USDC to user
  await mintTo(
    connection,
    wallet.payer,
    usdcMint,
    userUsdcAccount,
    wallet.payer,
    BigInt(1_000_000_000_000), // 6 decimals
  )
  console.log('Minted USDC token to wallet.payer:', usdcMint.toBase58())

  // Mint 1_000_000 DAWN to user
  await mintTo(
    connection,
    wallet.payer,
    dawnMint,
    userDawnAccount,
    wallet.payer,
    BigInt(1_000_000_000_000_000), // 9 decimals
  )
  console.log('Minted DAWN token to wallet.payer:', dawnMint.toBase58())

  // Generate config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID,
  )
  console.log('Config PDA:', configPda.toBase58())

  console.log('Setting up Raydium...')
  const { raydium, poolPda } = await setupRaydium(dawnMint, usdcMint)

  return {
    wallet: wallet.publicKey.toBase58(),
    dao: {
      secretKey: dao.secretKey.toString(),
      publicKey: dao.publicKey.toBase58(),
    },
    validatorPool: {
      secretKey: validatorPool.secretKey.toString(),
      publicKey: validatorPool.publicKey.toBase58(),
    },
    medallionPool: {
      secretKey: medallionPool.secretKey.toString(),
      publicKey: medallionPool.publicKey.toBase58(),
    },
    buildingOwner: {
      secretKey: buildingOwner.secretKey.toString(),
      publicKey: buildingOwner.publicKey.toBase58(),
    },
    tester: {
      secretKey: tester.secretKey.toString(),
      publicKey: tester.publicKey.toBase58(),
    },
    raydium: raydium.toBase58(),
    // mints
    usdcMint: usdcMint.toBase58(),
    dawnMint: dawnMint.toBase58(),
    // token accounts
    daoDawnAccount: daoDawnAccount.toBase58(),
    validatorDawnAccount: validatorDawnAccount.toBase58(),
    medallionDawnAccount: medallionDawnAccount.toBase58(),
    boDawnAccount: boDawnAccount.toBase58(),
    testerUsdcAccount: testerUsdcAccount.toBase58(),
    // PDA
    configPda: configPda.toBase58(),
    poolPda: poolPda.toBase58(),
  }
}

async function main() {
  let connection = new Connection('http://127.0.0.1:8899')

  const accounts = await setup(connection)
  console.log(accounts)

  // Save to a file
  fs.writeFileSync('testnet.json', JSON.stringify(accounts, null, 2))
}

main().catch(console.error)
