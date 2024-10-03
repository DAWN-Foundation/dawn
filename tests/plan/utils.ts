import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import {
  Keypair,
  ParsedTransactionWithMeta,
  PublicKey,
  VersionedTransactionResponse,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { Plan } from '../../target/types/plan'

export let mock: Mock

// Helper to confirm a transaction
async function confirmTx(
  connection: anchor.web3.Connection,
  tx: string,
): Promise<VersionedTransactionResponse> {
  const lastBlock = await connection.getLatestBlockhash()

  await connection.confirmTransaction(
    {
      signature: tx,
      blockhash: lastBlock.blockhash,
      lastValidBlockHeight: lastBlock.lastValidBlockHeight,
    },
    'confirmed',
  )

  const confirmedTx = await connection.getTransaction(tx, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  })

  return confirmedTx
}

// Helper to fund an account with SOL
export async function fund(
  connection: anchor.web3.Connection,
  account: PublicKey,
  amount: number,
) {
  const signature = await connection.requestAirdrop(account, amount * 10 ** 9)
  await confirmTx(connection, signature)
}

// Helper to get the event from the transaction
export async function getEvent(
  program: anchor.Program<Plan>,
  tx: string,
  name: string,
) {
  const confirmedTx = await confirmTx(program.provider.connection, tx)

  const [log] = confirmedTx.meta.logMessages.filter((msg) =>
    msg.startsWith('Program data: '),
  )

  const logEncoded = log.split('Program data: ')[1]
  const event = program.coder.events.decode(logEncoded)

  if (event.name !== name) {
    throw new Error(`Event name mismatch: ${event.name} !== ${name}`)
  }

  return event.data
}

export interface Mock {
  andrena: Keypair
  buildingOwner: Keypair
  tester: Keypair
  usdcMint: PublicKey
  dawnMint: PublicKey
  andrenaUsdcAccount: PublicKey
  andrenaDawnAccount: PublicKey
  testerUsdcAccount: PublicKey
  // config
  dawnFee: BN
  andrenaFee: BN
  andrenaDawnSplit: BN
  boDawnSplit: BN
  boEscrowSplit: BN
}

// Helper to setup the environment for tests and set the mock
// only run once in `initialize` test
export async function setup(
  connection: anchor.web3.Connection,
  wallet: NodeWallet,
) {
  // Create Andrena KeyPair
  const andrena = Keypair.generate()
  await fund(connection, andrena.publicKey, 1000)

  // Create Building Owner KeyPair
  const buildingOwner = Keypair.generate()
  await fund(connection, buildingOwner.publicKey, 1000)

  // Create Tester KeyPair
  const tester = Keypair.generate()
  await fund(connection, tester.publicKey, 1000)

  // Mint test USDC token
  const usdcMint = await createMint(
    connection,
    wallet.payer, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USDC)
  )
  // Mint test DAWN token
  const dawnMint = await createMint(
    connection,
    wallet.payer, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    9, // Decimals (9 decimals for DAWN)
  )

  // Create USDC account for Andrena
  const andrenaUsdcAccount = await createAccount(
    connection,
    andrena,
    usdcMint,
    TOKEN_PROGRAM_ID,
  )
  // Create DAWN account for Andrena
  const andrenaDawnAccount = await createAccount(
    connection,
    andrena,
    dawnMint,
    TOKEN_PROGRAM_ID,
  )
  // Create USDC account for Tester
  const { address: testerUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      tester,
      usdcMint,
      TOKEN_PROGRAM_ID,
    )

  // Mint 1'000 USDC to Tester account
  await mintTo(
    connection,
    tester, // Payer for tx
    usdcMint, // Mint account
    testerUsdcAccount, // Destination
    wallet.payer, // Authority
    1_000 * 10 ** 6, // Mint 1,000 USDC (remember 6 decimals)
  )

  const dawnFee = new BN(200) // 2% fee (dawn_fee)
  const andrenaFee = new BN(500) // 5% fee (andrena_fee)
  const andrenaDawnSplit = new BN(9000) // 90% fee (andrena_dawn_split)
  const boDawnSplit = new BN(8000) // 80% fee (bo_dawn_split)
  const boEscrowSplit = new BN(2000) // 20% fee (bo_escrow_split)

  mock = {
    andrena,
    buildingOwner,
    tester,
    usdcMint,
    dawnMint,
    andrenaUsdcAccount,
    andrenaDawnAccount,
    testerUsdcAccount,
    // config
    dawnFee,
    andrenaFee,
    andrenaDawnSplit,
    boDawnSplit,
    boEscrowSplit,
  }
}
