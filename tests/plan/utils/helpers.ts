import * as anchor from '@coral-xyz/anchor'
import { BN, Program } from '@coral-xyz/anchor'
import { PublicKey, VersionedTransactionResponse } from '@solana/web3.js'

import { Plan } from '../../../target/types/plan'

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
export async function getEvent<T>(
  program: anchor.Program<Plan>,
  tx: string,
  name: string,
): Promise<T> {
  const confirmedTx = await confirmTx(program.provider.connection, tx)

  const logs = confirmedTx.meta.logMessages.filter((msg) =>
    msg.startsWith('Program data: '),
  )
  const log = logs[logs.length - 1]

  const logEncoded = log.split('Program data: ')[1]
  const event = program.coder.events.decode(logEncoded)

  if (event.name !== name) {
    throw new Error(`Event name mismatch: ${event.name} !== ${name}`)
  }

  return event.data as T
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

// Helper to get all plans for a building
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
      'Plan',
      accountInfo.account.data,
    )
  })
}
