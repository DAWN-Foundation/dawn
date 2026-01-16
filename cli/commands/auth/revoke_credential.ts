import { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Dawn } from '../../../target/types/dawn'
import { AuthManager } from '../../../sdk/client/managers/auth'
import { PSKNetworkConfig } from '../../../sdk/utils/types'
import { connect, getFlag, getMock, submitTx } from '../../shared/cli-utils'
import { getSubscriptionPda } from '../../../sdk'

async function main() {
  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const plan = getFlag('--plan')
  if (!plan) throw new Error('--plan is required')
  const planPda = new PublicKey(plan)
  const [subscriptionPda] = getSubscriptionPda(program, planPda, wallet.payer)

  const authMethod = new PublicKey(getFlag('--auth-method'))
  if (!authMethod) throw new Error('--auth-method is required')
  const authMethodPda = new PublicKey(authMethod)

  const credential = getFlag('--credential')
  if (!credential) throw new Error('--credential is required')
  const credentialPda = new PublicKey(credential)

  try {
    const itx = await program.methods
      .revokeCredential()
      .accountsPartial({
        caller: wallet.publicKey,
        subscription: subscriptionPda,
        plan: planPda,
        authMethod: authMethodPda,
        credential: credentialPda,
      })
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
