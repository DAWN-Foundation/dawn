import fs from 'fs'
import { Connection, Keypair } from '@solana/web3.js'
import { PlanInitConfig } from './types'

const { PublicKey } = require('@solana/web3.js')
const {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} = require('@solana/spl-token')

const PROGRAM_ID = new PublicKey('79d7dzfG5hC2xCzNUrwyAdG2agBh6NM9gATyXPBr9zFq')

async function fund(connection: Connection, wallet: Keypair) {
  const signature = await connection.requestAirdrop(
    wallet.publicKey,
    100 * 10 ** 9,
  )
  const latestBlockHash = await connection.getLatestBlockhash()

  await connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature,
  })
  const balance = await connection.getBalance(wallet.publicKey)
  console.log(`Funded (${wallet.publicKey.toBase58()}) with`, balance)
}

async function setup(connection: Connection): Promise<PlanInitConfig> {
  // Create Root KeyPair
  let root = Keypair.generate()
  console.log('\nCreating root account:', root.publicKey.toBase58())
  await fund(connection, root)

  // Create Andrena KeyPair
  const andrena = Keypair.generate()
  console.log('\nCreating Andrena account:', andrena.publicKey.toBase58())
  await fund(connection, andrena)

  // Create DAWN Foundation KeyPair
  const dawn = Keypair.generate()
  console.log('\nCreating DAWN Foundation account:', dawn.publicKey.toBase58())
  await fund(connection, dawn)

  // Create Building Owner KeyPair
  const buildingOwner = Keypair.generate()
  console.log(
    '\nCreating Building Owner account:',
    buildingOwner.publicKey.toBase58(),
  )
  await fund(connection, buildingOwner)

  // Create Tester KeyPair
  const tester = Keypair.generate()
  console.log('\nCreating Tester account:', tester.publicKey.toBase58())
  await fund(connection, tester)

  // Mint test USDC token
  const usdcMint = await createMint(
    connection,
    root, // Payer for transaction
    root.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USDC)
  )
  console.log('\nMinted USDC token:', usdcMint.toBase58())

  // Mint test DAWN token
  const dawnMint = await createMint(
    connection,
    root, // Payer for transaction
    root.publicKey, // Mint authority
    null, // Freeze authority
    9, // Decimals (9 decimals for DAWN)
  )
  console.log('Minted DAWN token:', dawnMint.toBase58())

  // Create USDC account for Andrena
  const { address: andrenaUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      andrena,
      usdcMint,
      andrena.publicKey,
    )
  console.log(
    '\nCreating USDC account for Andrena:',
    andrenaUsdcAccount.toBase58(),
  )

  // Create DAWN account for Andrena
  const { address: andrenaDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      andrena,
      dawnMint,
      andrena.publicKey,
    )
  console.log(
    'Creating DAWN account for Andrena:',
    andrenaDawnAccount.toBase58(),
  )

  // Create USDC account for DAWN Foundation
  const { address: dawnUsdcAccount } = await getOrCreateAssociatedTokenAccount(
    connection,
    dawn,
    usdcMint,
    dawn.publicKey,
  )
  console.log(
    'Creating USDC account for DAWN Foundation:',
    dawnUsdcAccount.toBase58(),
  )

  // Create USDC account for Tester
  const { address: boUsdcAccount } = await getOrCreateAssociatedTokenAccount(
    connection,
    buildingOwner,
    usdcMint,
    buildingOwner.publicKey,
  )
  console.log(
    'Creating USDC account for Building Owner:',
    boUsdcAccount.toBase58(),
  )

  // Create USDC account for Tester
  const { address: testerUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      tester,
      usdcMint,
      tester.publicKey,
    )
  console.log('Creating USDC account for Tester:', testerUsdcAccount.toBase58())

  // Generate config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID,
  )
  console.log('Config PDA:', configPda.toBase58())

  return {
    root: {
      secretKey: root.secretKey.toString(),
      publicKey: root.publicKey.toBase58(),
    },
    andrena: {
      secretKey: andrena.secretKey.toString(),
      publicKey: andrena.publicKey.toBase58(),
    },
    dawn: {
      secretKey: dawn.secretKey.toString(),
      publicKey: dawn.publicKey.toBase58(),
    },
    buildingOwner: {
      secretKey: buildingOwner.secretKey.toString(),
      publicKey: buildingOwner.publicKey.toBase58(),
    },
    tester: {
      secretKey: tester.secretKey.toString(),
      publicKey: tester.publicKey.toBase58(),
    },
    usdcMint: usdcMint.toBase58(),
    dawnMint: dawnMint.toBase58(),
    andrenaUsdcAccount: andrenaUsdcAccount.toBase58(),
    andrenaDawnAccount: andrenaDawnAccount.toBase58(),
    dawnUsdcAccount: dawnUsdcAccount.toBase58(),
    boUsdcAccount: boUsdcAccount.toBase58(),
    testerUsdcAccount: testerUsdcAccount.toBase58(),
    configPda: configPda.toBase58(),
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
