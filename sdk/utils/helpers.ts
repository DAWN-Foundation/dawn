import * as anchor from '@coral-xyz/anchor'
import { BN, Program } from '@coral-xyz/anchor'
import { PublicKey, Keypair, TransactionSignature } from '@solana/web3.js'
import { readFileSync } from 'fs'
import * as toml from 'toml'
import { Dawn } from '../../target/types/dawn'

import { BanksTransactionMeta } from 'solana-bankrun'
import { hasFlag } from '../../cli/shared/cli-utils'

function getProgramId(): PublicKey {
  const anchorToml = toml.parse(readFileSync('./Anchor.toml', 'utf-8'))

  const isDevnet = hasFlag('--devnet')

  return new PublicKey(
    isDevnet
      ? anchorToml.programs.devnet.dawn
      : anchorToml.programs.localnet.dawn,
  )
}

export const PROGRAM_ID = getProgramId()
export const COORD_DENOMINATOR = 1e6

export type DeviceType = anchor.IdlTypes<Dawn>['deviceType']
export type OrganizationType = anchor.IdlTypes<Dawn>['organizationType']
export type AuthMethodType = anchor.IdlTypes<Dawn>['authMethodType']

export type IpV4Bytes = [number, number, number, number]

export type MacAddress = [number, number, number, number, number, number]

export interface GenerateDevice {
  name: string
  coord: [number, number]
  mac: MacAddress
  height: number
  placement: [number, number]
  localDomain: string
}

export type IpV6Bytes = number[]

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

  for (const log of logs) {
    const logEncoded = log.split('Program data: ')[1]
    const event = program.coder.events.decode(logEncoded)
    if (!event) continue
    if (event.name === name) {
      return event.data as T
    }
  }

  throw new Error(`Event with name ${name} not found`)
}

export async function getEvents<T>(
  program: Program<Dawn>,
  tx: BanksTransactionMeta,
  name: string,
): Promise<T[]> {
  const logs = tx.logMessages.filter((msg) => msg.startsWith('Program data: '))

  const events: T[] = []

  for (const log of logs) {
    const logEncoded = log.split('Program data: ')[1]
    const event = program.coder.events.decode(logEncoded)
    if (!event) continue
    if (event.name === name) {
      events.push(event.data as T)
    }
  }

  return events
}

export function deviceTypeSeed(deviceType: DeviceType) {
  if (deviceType.wirelessRadio) return Buffer.from([1])
  return Buffer.from([0])
}

export function organizationTypeSeed(organizationType: OrganizationType) {
  const key = Object.keys(organizationType)[0]
  if (key === 'endUser') return Buffer.from([3])
  if (key === 'rir') return Buffer.from([2])
  if (key === 'registry') return Buffer.from([1])
  if (key === 'numberAuthority') return Buffer.from([0])
  throw new Error(`Invalid organization type: ${key}`)
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
