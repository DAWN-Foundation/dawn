import fs from 'fs'
import { execSync } from 'child_process'
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
import { Plan } from '../../../target/types/plan'

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

// Helper to deploy the Raydium CLMM
function deployRaydium() {
  // Deploy the program
  const output = execSync(
    'cd ../raydium-clmm && anchor deploy --provider.cluster localnet',
    {
      encoding: 'utf-8',
    },
  )
  console.log('Raydium CLMM deploy completed successfully')
  console.log('Output:', output.toString())
  const raydium = output
    .toString()
    .split('\n')
    .find((line) => line.startsWith('Program Id: '))
    .split('Program Id: ')[1]

  return raydium
}

export interface Mock {
  dao: Keypair
  validatorPool: Keypair
  medallionPool: Keypair
  buildingOwner: Keypair
  tester: Keypair
  // mints
  usdcMint: PublicKey
  dawnMint: PublicKey
  // token accounts
  daoDawnAccount: PublicKey
  validatorDawnAccount: PublicKey
  medallionDawnAccount: PublicKey
  boDawnAccount: PublicKey
  testerUsdcAccount: PublicKey
  // raydium
  raydium: PublicKey
  // config
  daoFee: BN
  validatorFee: BN
  medallionFee: BN
}

// Helper to setup the environment for tests and set the mock
// only run once in `initialize` test
export async function setup(
  connection: anchor.web3.Connection,
  wallet: NodeWallet,
) {
  // Create DAWN DAO KeyPair
  const dao = Keypair.generate()
  await fund(connection, dao.publicKey, 1000)

  // Create Validator Pool KeyPair
  const validatorPool = Keypair.generate()
  await fund(connection, validatorPool.publicKey, 1000)

  // Create Medallion Pool KeyPair
  const medallionPool = Keypair.generate()
  await fund(connection, medallionPool.publicKey, 1000)

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

  // Create DAWN account for DAWN DAO
  const { address: daoDawnAccount } = await getOrCreateAssociatedTokenAccount(
    connection,
    dao,
    dawnMint,
    dao.publicKey,
  )

  // Create DAWN account for Validator Pool
  const { address: validatorDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      validatorPool,
      dawnMint,
      validatorPool.publicKey,
    )

  // Create DAWN account for Medallion Pool
  const { address: medallionDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      medallionPool,
      dawnMint,
      medallionPool.publicKey,
    )

  // Create DAWN account for Building Owner
  const { address: boDawnAccount } = await getOrCreateAssociatedTokenAccount(
    connection,
    buildingOwner,
    dawnMint,
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

  // Deploy Raydium CLMM
  const raydium = deployRaydium();

  const daoFee = new BN(300) // 3% fee (dao_fee)
  const validatorFee = new BN(300) // 3% fee (validator_fee)
  const medallionFee = new BN(900) // 9% fee (medallion_fee)

  mock = {
    dao,
    validatorPool,
    medallionPool,
    buildingOwner,
    tester,
    usdcMint,
    dawnMint,
    daoDawnAccount,
    validatorDawnAccount,
    medallionDawnAccount,
    boDawnAccount,
    testerUsdcAccount,
    raydium: new PublicKey(raydium),
    // config
    daoFee,
    validatorFee,
    medallionFee,
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
