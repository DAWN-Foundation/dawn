import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js'
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor'
import { Dawn } from '../../../target/types/dawn'
import { getAuthMethodPda } from '../../../sdk/pda/amf'
import { getPlanPda } from '../../../sdk/pda/plan'
import { connect, getFlag, getMock, submitTx } from '../../shared/cli-utils'
import { mock } from '../../../sdk/utils/mock'
import {
  createPSKMethodParams,
  getLocalDomainPda,
  getPskAuthMethodPda,
  PSKNetworkConfig,
  serializePSKMethodParams,
  validatePSKMethodParams,
} from '../../../sdk/utils'

export async function addAuthMethod(
  program: Program<Dawn>,
  planOwner: PublicKey,
  planPda: PublicKey,
  device: PublicKey,
  authMethodAuthority: PublicKey,
  authMethodType: any,
  authMethodParameters: Buffer,
) {

  const config: PSKNetworkConfig = {
    ssid: 'DawnTestNetwork',
    securityStandard: 'WPA3_PSK',
    encryptionAlgorithm: 'AES_GCMP_256',
  }

  const params = createPSKMethodParams(config)
  validatePSKMethodParams(params)
  const parametersBuffer = serializePSKMethodParams(params)

  const [authMethodPda] = getPskAuthMethodPda(
    program,
    planOwner,
    device,
    parametersBuffer,
  )

  const ix = await program.methods
    .addAuthMethod()
    .accountsStrict({
      caller: planOwner,
      plan: planPda,
      device: device,
      authMethod: authMethodPda,
    })
    .instruction()

  return ix
}

async function main() {
  const { wallet, connection, program } = await connect()
  const mock = getMock()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const planPda = new PublicKey(getFlag('--plan') || mock.planPda)
  const devicePda = new PublicKey(getFlag('--device') || mock.devicePda)
  const clientPubkey = new PublicKey(
    getFlag('--client') || wallet.payer.publicKey,
  )

  const itx = await addAuthMethod(
    program,
    wallet.payer.publicKey,
    planPda,
    devicePda,
    wallet.payer.publicKey,
    { psk: {} },
    Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
  )
  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
