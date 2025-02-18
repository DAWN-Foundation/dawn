import { connect, getFlag, getMock, submitTx } from './utils'
import { getServiceAgreementPda } from '../utils'
import { BN } from 'bn.js'

async function main() {
  const mock = getMock()
  const { program, wallet, connection } = await connect()

  const threshold = new BN(getFlag('--threshold') || mock.slaThreshold)
  const payoutRatio = new BN(getFlag('--payout-ratio') || mock.slaPayoutRatio)

  const serviceAgreementPda = getServiceAgreementPda(
    program,
    threshold,
    payoutRatio,
  )

  console.log({ serviceAgreementPda: serviceAgreementPda.toBase58() })

  try {
    const itx = await program.methods
      .addServiceAgreement(threshold, payoutRatio)
      .accounts({
        caller: wallet.publicKey,
        config: mock.configPda,
        serviceAgreement: serviceAgreementPda,
      })
      .signers([wallet.payer])
      .instruction()

    try {
      const txResult = await submitTx(connection, wallet, itx)
      console.log('Tx submitted', { txResult })
    } catch (error) {
      console.error(error)
    }
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
