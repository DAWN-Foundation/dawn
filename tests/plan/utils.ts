import * as anchor from '@coral-xyz/anchor'
import { BN, Program } from '@coral-xyz/anchor'
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
export async function confirmTx(
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
  // mints
  usdcMint: PublicKey
  dawnMint: PublicKey
  // token accounts
  andrenaUsdcAccount: PublicKey
  andrenaDawnAccount: PublicKey
  dawnUsdcAccount: PublicKey
  boUsdcAccount: PublicKey
  testerUsdcAccount: PublicKey
  // config
  dawnFee: BN
  andrenaFee: BN
  andrenaDawnRatio: BN
  boDawnRatio: BN
  boEscrowRatio: BN
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

  // Create DAWN Foundation KeyPair
  const dawn = Keypair.generate()
  await fund(connection, dawn.publicKey, 1000)

  console.log('Andrena:', andrena.publicKey.toBase58())
  console.log('DAWN:', dawn.publicKey.toBase58())

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
  const { address: andrenaUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      andrena,
      usdcMint,
      andrena.publicKey,
    )
  // Create DAWN account for Andrena
  const { address: andrenaDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      andrena,
      dawnMint,
      andrena.publicKey,
    )
  // Create USDC account for DAWN Foundation
  const { address: dawnUsdcAccount } = await getOrCreateAssociatedTokenAccount(
    connection,
    dawn,
    usdcMint,
    dawn.publicKey,
  )
  // Create USDC account for Tester
  const { address: boUsdcAccount } = await getOrCreateAssociatedTokenAccount(
    connection,
    buildingOwner,
    usdcMint,
    buildingOwner.publicKey,
  )
  // Create USDC account for Tester
  const { address: testerUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      tester,
      usdcMint,
      tester.publicKey,
    )

  const dawnFee = new BN(200) // 2% fee (dawn_fee)
  const andrenaFee = new BN(500) // 5% fee (andrena_fee)
  const andrenaDawnRatio = new BN(9000) // 90% fee (andrena_dawn_ratio)
  const boDawnRatio = new BN(8000) // 80% fee (bo_dawn_ratio)
  const boEscrowRatio = new BN(2000) // 20% fee (bo_escrow_ratio)

  mock = {
    andrena,
    buildingOwner,
    tester,
    usdcMint,
    dawnMint,
    andrenaUsdcAccount,
    andrenaDawnAccount,
    dawnUsdcAccount,
    boUsdcAccount,
    testerUsdcAccount,
    // config
    dawnFee,
    andrenaFee,
    andrenaDawnRatio,
    boDawnRatio,
    boEscrowRatio,
  }
}

// Helper function to get the PDA for a plan given plan parameters
export function getPlanPda(
  program: Program<Plan>,
  building: PublicKey,
  price: BN,
  duration: number,
  speed: number,
  capacity: BN,
  slaId: BN,
): [PublicKey, number] {
  const durationBuffer = Buffer.alloc(2) // 2 bytes for a 16-bit integer
  durationBuffer.writeUInt16LE(duration)

  const speedBuffer = Buffer.alloc(4) // 4 bytes for a 32-bit integer
  speedBuffer.writeUInt32LE(speed)

  const [planPda, planBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('plan'),
      Buffer.from(building.toBytes()),
      Buffer.from(price.toArray('le', 8)),
      durationBuffer,
      speedBuffer,
      Buffer.from(capacity.toArray('le', 8)),
      Buffer.from(slaId.toArray('le', 8)),
    ],
    program.programId,
  )

  return [planPda, planBump]
}

export async function getPlansForBuilding(
  program: Program<Plan>, // Anchor program
  building: PublicKey, // Public key of the building
): Promise<any[]> {
  // Define the byte offset for the `building` field in the Plan account (8 bytes for discriminator + 32 bytes for owner)
  const BUILDING_OFFSET = 8 + 32

  // Fetch all plan accounts and filter by building key
  const plans = await program.provider.connection.getProgramAccounts(
    program.programId,
    {
      // Filtering accounts by the `building` public key stored in the Plan account
      filters: [
        {
          memcmp: {
            offset: BUILDING_OFFSET, // Offset where the building public key is stored
            bytes: building.toBase58(), // The building public key to filter by
          },
        },
      ],
    },
  )

  // Decode and return the accounts
  return plans.map((accountInfo) => {
    return program.account.plan.coder.accounts.decode(
      'plan',
      accountInfo.account.data,
    )
  })
}
