import * as anchor from '@coral-xyz/anchor'
import { BN, Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import { BanksTransactionMeta } from 'solana-bankrun'

export const COORD_DENOMINATOR = new BN(10).pow(new BN(10));

export type DeviceType = anchor.IdlTypes<Dawn>['DeviceType']

// Helper to fund an account with SOL
export async function fund(
  connection: anchor.web3.Connection,
  account: PublicKey,
  amount: number,
  commitment: 'confirmed' | 'finalized' = 'confirmed',
) {
  const signature = await connection.requestAirdrop(account, amount * 10 ** 9)
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash()
  await connection.confirmTransaction(
    {
      blockhash,
      lastValidBlockHeight,
      signature,
    },
    commitment,
  )
}

// Helper to get the event from the transaction
export async function getEvent<T>(
  program: Program<Dawn>,
  tx: BanksTransactionMeta,
  name: string,
): Promise<T> {
  const logs = tx.logMessages.filter((msg) => msg.startsWith('Program data: '))
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
  program: Program<Dawn>,
  device: PublicKey,
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
      Buffer.from(device.toBytes()),
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

// Helper to get all plans for a device
export async function getPlansForDevice(
  program: Program<Dawn>, // Anchor program
  device: PublicKey, // Public key of the device
): Promise<any[]> {
  // Define the byte offset for the `device` field in the Plan account (8 bytes for discriminator + 32 bytes for owner)
  const DEVICE_OFFSET = 8 + 32

  // Fetch all plan accounts and filter by device key
  const plans = await program.provider.connection.getProgramAccounts(
    program.programId,
    {
      // Filtering accounts by the `device` public key stored in the Plan account
      filters: [
        {
          memcmp: {
            offset: DEVICE_OFFSET, // Offset where the device public key is stored
            bytes: device.toBase58(), // The device public key to filter by
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