import { BN } from '@coral-xyz/anchor'

import { connect, getFlag, getMock, submitTx } from '../../shared/cli-utils'
import { getPlanPda, getLocalDomainPda } from '../../../sdk/utils'
import { SystemProgram, PublicKey } from '@solana/web3.js'

async function main() {
  const mock = getMock()

  const planType = getFlag('--type') || 'L3' // L3 (original) or L2 (derived)
  const localDomain = getFlag('--local-domain') || mock.localDomain
  if (!localDomain) throw new Error('--local-domain is required')

  const name = getFlag('--name') || mock.planName
  const price = new BN(getFlag('--price') || mock.planPrice)
  const duration = parseInt(getFlag('--duration')) || mock.planDuration
  const speed = parseInt(getFlag('--speed')) || mock.planSpeed
  const capacity = new BN(getFlag('--capacity') || mock.planCapacity)

  const authMethodsRaw = getFlag('--auth-methods') ?? null
  const authMethods = authMethodsRaw
    ? authMethodsRaw.split(',').map((method) => new PublicKey(method))
    : null

  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const localDomainPda = getLocalDomainPda(
    program,
    wallet.payer.publicKey,
    localDomain,
  )

  if (planType.toUpperCase() === 'L3') {
    // Create L3 plan (original plan with distribution domain)
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

    const [distributionDomainPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('distribution_domain'),
        planPda.toBuffer(),
        localDomainPda.toBuffer(),
      ],
      program.programId,
    )

    console.log({
      planPda: planPda.toBase58(),
      distributionDomainPda: distributionDomainPda.toBase58(),
    })

    const itx = await program.methods
      .addL3Plan(name, price, duration, speed, capacity, null)
      .accountsStrict({
        caller: wallet.payer.publicKey,
        serviceAgreement: mock.serviceAgreementPda,
        plan: planPda,
        localDomain: localDomainPda,
        distributionDomain: distributionDomainPda,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(
        authMethods.map((pubkey) => ({
          pubkey,
          isWritable: false,
          isSigner: false,
        })),
      )
      .signers([wallet.payer])
      .instruction()

    try {
      const txResult = await submitTx(connection, wallet, itx)
      console.log('L3 Plan created successfully', { txResult })
    } catch (error) {
      console.error('Error creating L3 plan:', error)
    }
  } else if (planType.toUpperCase() === 'L2') {
    // Create L2 plan (derived plan with access domain)
    const parentPlanAddress = getFlag('--parent-plan') ?? null

    const [planPda] = getPlanPda(
      program,
      localDomainPda,
      parentPlanAddress ? new PublicKey(parentPlanAddress) : null,
      name,
      price,
      duration,
      speed,
      capacity,
      null,
      mock.serviceAgreementPda,
    )

    const [accessDomainPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('access_domain'),
        planPda.toBuffer(),
        localDomainPda.toBuffer(),
      ],
      program.programId,
    )

    console.log({
      planPda: planPda.toBase58(),
      accessDomainPda: accessDomainPda.toBase58(),
      parentPlan: parentPlanAddress,
    })

    const itx = await program.methods
      .addL2Plan(name, price, duration, speed, capacity, null)
      .accountsStrict({
        caller: wallet.payer.publicKey,
        serviceAgreement: mock.serviceAgreementPda,
        parentPlan: parentPlanAddress ? new PublicKey(parentPlanAddress) : null,
        plan: planPda,
        localDomain: localDomainPda,
        accessDomain: accessDomainPda,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(
        authMethods.map((pubkey) => ({
          pubkey,
          isWritable: false,
          isSigner: false,
        })),
      )
      .signers([wallet.payer])
      .instruction()

    try {
      const txResult = await submitTx(connection, wallet, itx)
      console.log('L2 Plan created successfully', { txResult })
    } catch (error) {
      console.error('Error creating L2 plan:', error)
    }
  } else {
    throw new Error('Invalid plan type. Use --type L3 or --type L2')
  }
}

main().catch(console.error)
