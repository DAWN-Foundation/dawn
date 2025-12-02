import { PublicKey } from '@solana/web3.js'
import { connect, getFlag, getMock, submitTx } from '../../shared/cli-utils'
import { AuthManager } from '../../../sdk'
import { PSKNetworkConfig } from '../../../sdk/utils'
import { generateEncryptionKeypair } from '../../../sdk/utils/encrypt'
import { encodeBase64 } from 'tweetnacl-util'

async function main() {
  const { wallet, connection, program } = await connect()
  const mock = getMock()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const authManager = new AuthManager(program)

  const devicePda = new PublicKey(getFlag('--device'))
  if (!devicePda) throw new Error('--device is required')

  const keypair = generateEncryptionKeypair()
  console.log('Keypair', {
    publicKey: encodeBase64(keypair.publicKey),
    privateKey: encodeBase64(keypair.secretKey),
  })

  const encryptionKey = keypair.publicKey

  const pskParams: PSKNetworkConfig = {
    ssid: 'DawnTestNetwork',
    securityStandard: 'WPA3_PSK',
    encryptionAlgorithm: 'AES_GCMP_256',
  }

  const { itx, authMethodPda } = await authManager.registerPskAuthMethod(
    mock.configPda,
    wallet.payer.publicKey,
    devicePda,
    pskParams,
    encryptionKey,
  )

  console.log({ authMethodPda: authMethodPda.toBase58() })

  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
