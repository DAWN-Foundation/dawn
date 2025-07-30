import { BN } from '@coral-xyz/anchor'

import { connect, getFlag, getMock, submitTx } from '../../shared/cli-utils'
import { getPlanPda, getLocalDomainPda } from '../../../sdk/utils'
import { SystemProgram } from '@solana/web3.js'

async function main() {
  const mock = getMock()

  const localDomain = getFlag('--local-domain') || mock.localDomain
  if (!localDomain) throw new Error('--local-domain is required')

  const name = getFlag('--name') || mock.planName
  const price = new BN(getFlag('--price') || mock.planPrice)
  const duration = parseInt(getFlag('--duration')) || mock.planDuration
  const speed = parseInt(getFlag('--speed')) || mock.planSpeed
  const capacity = new BN(getFlag('--capacity') || mock.planCapacity)

  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const localDomainPda = getLocalDomainPda(
    program,
    wallet.payer.publicKey,
    localDomain,
  )

  const [planPda] = getPlanPda(
    program,
    localDomainPda,
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
    .addPlan(
      name,
      price,
      duration,
      speed,
      capacity,
      null,
      mock.planAuthMethods,
      localDomain,
    )
    .accountsStrict({
      caller: wallet.payer.publicKey,
      serviceAgreement: mock.serviceAgreementPda,
      parentPlan: null,
      plan: planPda,
      subscription: null,
      localDomain: localDomainPda,
      systemProgram: SystemProgram.programId,
    })
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
