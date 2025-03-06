import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import { connect, getFlag, getIDL, getMock, getWallet, submitTx } from './utils'
import { getAccessDomainPda, getPlanPda } from '../utils'

async function main() {
  const mock = getMock()

  const device = getFlag('--device')
  if (!device) throw new Error('--device is required')
  const devicePda = new PublicKey(device)

  const name = getFlag('--name') || mock.planName
  const price = new BN(getFlag('--price') || mock.planPrice)
  const duration = parseInt(getFlag('--duration')) || mock.planDuration
  const speed = parseInt(getFlag('--speed')) || mock.planSpeed
  const capacity = new BN(getFlag('--capacity') || mock.planCapacity)

  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const accessDomainPda = getAccessDomainPda(program, devicePda)

  const [planPda] = getPlanPda(
    program,
    accessDomainPda,
    devicePda,
    null,
    name,
    price,
    duration,
    speed,
    capacity,
    null,
    mock.serviceAgreementPda,
  )

  console.log({ planPda: planPda.toBase58() })

  const itx = await program.methods
    .addPlan(name, price, duration, speed, capacity, null, mock.planAuthMethods)
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
