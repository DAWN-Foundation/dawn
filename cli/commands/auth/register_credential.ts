import { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Dawn } from '../../../target/types/dawn'
import { AuthManager } from '../../../sdk/client/managers/auth'
import { PSKNetworkConfig } from '../../../sdk/utils/types'
import { connect, getFlag, getMock, submitTx } from '../../shared/cli-utils'

async function main() {
  const { wallet, connection, program } = await connect()
  const mock = getMock()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const plan = getFlag('--plan')
  if (!plan) throw new Error('--plan is required')
  const planPda = new PublicKey(plan)

  const authMethod = new PublicKey(getFlag('--auth-method'))
  if (!authMethod) throw new Error('--auth-method is required')
  const authMethodPda = new PublicKey(authMethod)

  const psk = getFlag('--psk') || '0'.repeat(16)
  if (psk.length !== 16) throw new Error('--psk must be 16 characters')
  console.log({ psk })

  try {
    const authManager = new AuthManager(program)

    const { itx, credentialPda } = await authManager.registerPskCredential(
      wallet.payer.publicKey,
      planPda,
      authMethodPda,
      psk,
    )

    console.log({ credentialPda: credentialPda.toBase58() })

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
