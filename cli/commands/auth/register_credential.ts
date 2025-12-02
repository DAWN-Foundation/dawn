import { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Dawn } from '../../../target/types/dawn'
import { AuthManager } from '../../../sdk/client/managers/auth'
import { PSKNetworkConfig } from '../../../sdk/utils/types'
import { connect, getFlag, getMock } from '../../shared/cli-utils'

async function main() {
  const { wallet, connection, program } = await connect()
  const mock = getMock()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const plan = getFlag('--plan') 
  if (!plan) throw new Error('--plan is required')
  
    const devicePda = new PublicKey(getFlag('--device') || mock.devicePda)
  const clientPubkey = new PublicKey(
    getFlag('--client') || wallet.payer.publicKey,
  )


  const ssid = getFlag('--ssid') || 'DawnTestNetwork'

  try {
    const authManager = new AuthManager(program)

    // const config: PSKNetworkConfig = {
    //   ssid,
    //   securityStandard,
    //   encryptionAlgorithm,
    //   pskRotationInterval,
    // }

    // await authManager.registerPskCredential(
    //   wallet.payer.publicKey,
    //   devicePda,
    //   config,
    //   encryptionKey,
    // )
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
