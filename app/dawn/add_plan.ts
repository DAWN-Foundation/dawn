import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import {
  connect,
  getFlag,
  getIDL,
  getPlanPda,
  getWallet,
  submitTx,
} from './utils'

// CONSTANTS
const PRICE = 100_000_000
const DURATION = 30
const SPEED = 100
const CAPACITY = 0
const SLA = 1

async function main() {
  const building = getFlag('--building')
  if (!building) {
    throw new Error('--building is required')
  }
  const buildingPda = new PublicKey(building)

  const price = new BN(getFlag('--price') || PRICE)
  const duration = parseInt(getFlag('--duration')) || DURATION
  const speed = parseInt(getFlag('--speed')) || SPEED
  const capacity = new BN(getFlag('--capacity') || CAPACITY)
  const sla = new BN(getFlag('--sla') || SLA)

  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [planPda] = getPlanPda(
    program,
    buildingPda,
    price,
    duration,
    speed,
    capacity,
    sla,
  )

  console.log({ planPda: planPda.toBase58() })

  const itx = await program.methods
    .addPlan(price, duration, speed, capacity, sla)
    .accounts({
      caller: wallet.payer.publicKey,
      building: buildingPda,
      plan: planPda,
    } as {})
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
