import { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Dawn } from '../../../target/types/dawn'
import { AuthManager } from '../../../sdk/client/managers/auth'
import { PSKNetworkConfig } from '../../../sdk/utils/types'
import { connect, getFlag, getMock } from '../../shared/cli-utils'

/**
 * CLI command to register PSK authentication method
 */
export async function registerPskAuthMethodCommand(
  program: Program<Dawn>,
  authority: PublicKey,
  device: PublicKey,
  ssid: string,
  configPda: PublicKey,
  securityStandard: 'WPA2_PSK' | 'WPA3_PSK' = 'WPA3_PSK',
  encryptionAlgorithm:
    | 'AES_CCMP'
    | 'AES_GCMP'
    | 'AES_GCMP_256' = 'AES_GCMP_256',
  pskRotationInterval?: number,
): Promise<{ signature: string; authMethodPda: PublicKey }> {
  const authManager = new AuthManager(program)

  const config: PSKNetworkConfig = {
    ssid,
    securityStandard,
    encryptionAlgorithm,
    pskRotationInterval,
  }

  return await authManager.registerPskAuthMethod(
    authority,
    device,
    config,
    configPda,
  )
}

/**
 * CLI command to register PSK credential for a client
 */
export async function registerPskCredentialCommand(
  program: Program<Dawn>,
  authority: PublicKey,
  authMethodPda: PublicKey,
  clientPubkey: PublicKey,
  psk: string,
): Promise<{ signature: string; credentialPda: PublicKey }> {
  const authManager = new AuthManager(program)

  return await authManager.registerPskCredential(
    authority,
    authMethodPda,
    clientPubkey,
    psk,
  )
}

/**
 * CLI command to register complete PSK authentication (method + credential)
 */
export async function registerPskAuthCommand(
  program: Program<Dawn>,
  authority: PublicKey,
  device: PublicKey,
  clientPubkey: PublicKey,
  psk: string,
  ssid: string,
  configPda: PublicKey,
  securityStandard: 'WPA2_PSK' | 'WPA3_PSK' = 'WPA3_PSK',
  encryptionAlgorithm:
    | 'AES_CCMP'
    | 'AES_GCMP'
    | 'AES_GCMP_256' = 'AES_GCMP_256',
  pskRotationInterval?: number,
): Promise<{
  authMethodSignature: string
  credentialSignature: string
  authMethodPda: PublicKey
  credentialPda: PublicKey
}> {
  const authManager = new AuthManager(program)

  const config: PSKNetworkConfig = {
    ssid,
    securityStandard,
    encryptionAlgorithm,
    pskRotationInterval,
  }

  return await authManager.registerPskAuth(
    authority,
    device,
    clientPubkey,
    psk,
    config,
    configPda,
  )
}

async function main() {
  const { wallet, connection, program } = await connect()
  const mock = getMock()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const devicePda = new PublicKey(getFlag('--device') || mock.devicePda)
  const clientPubkey = new PublicKey(
    getFlag('--client') || wallet.payer.publicKey,
  )
  const configPda = new PublicKey(getFlag('--config') || mock.configPda)
  const psk = getFlag('--psk') || 'SuperSecurePassword123!'
  const ssid = getFlag('--ssid') || 'DawnTestNetwork'

  try {
    const {
      authMethodSignature,
      credentialSignature,
      authMethodPda,
      credentialPda,
    } = await registerPskAuthCommand(
      program,
      wallet.payer.publicKey,
      devicePda,
      clientPubkey,
      psk,
      ssid,
      configPda,
    )

    console.log({
      authMethodSignature,
      credentialSignature,
      authMethodPda: authMethodPda.toBase58(),
      credentialPda: credentialPda.toBase58(),
    })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)