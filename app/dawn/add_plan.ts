import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import { connect, getFlag, getIDL, getMock, getWallet, submitTx } from './utils'
import { getAccessDomainPda, getPlanPda } from '../utils'

// CONSTANTS
const PRICE = 100_000_000
const DURATION = 30
const SPEED = 100
const CAPACITY = 0

async function main() {
  const device = getFlag('--device')
  if (!device) throw new Error('--device is required')
  const devicePda = new PublicKey(device)

  const price = new BN(getFlag('--price') || PRICE)
  const duration = parseInt(getFlag('--duration')) || DURATION
  const speed = parseInt(getFlag('--speed')) || SPEED
  const capacity = new BN(getFlag('--capacity') || CAPACITY)

  const { wallet, connection, program } = await connect()
  const mock = getMock()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const accessDomainPda = getAccessDomainPda(program, devicePda)

  const [planPda] = getPlanPda(
    program,
    accessDomainPda,
    devicePda,
    null,
    price,
    duration,
    speed,
    capacity,
    null,
    mock.serviceAgreementPda,
  )

  console.log({ planPda: planPda.toBase58() })

  const itx = await program.methods
    .addPlan(price, duration, speed, capacity, null, mock.planAuthMethods)
    .accounts({
      caller: wallet.payer.publicKey,
      accessDomain: accessDomainPda,
      device: devicePda,
      serviceAgreement: mock.serviceAgreementPda,
      plan: planPda,
      parentPlan: null,
      subscription: null,
    } as {})
    .signers([wallet.payer])
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
