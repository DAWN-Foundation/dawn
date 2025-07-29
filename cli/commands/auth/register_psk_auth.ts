import { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Dawn } from '../../../target/types/dawn'
import { AuthManager } from '../../../sdk/client/managers/auth'
import { PSKNetworkConfig } from '../../../sdk/utils/types'

/**
 * CLI command to register PSK authentication method
 */
export async function registerPskAuthMethodCommand(
  program: Program<Dawn>,
  authority: PublicKey,
  plan: PublicKey,
  ssid: string,
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

  return await authManager.registerPskAuthMethod(authority, plan, config)
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
  plan: PublicKey,
  clientPubkey: PublicKey,
  psk: string,
  ssid: string,
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
    plan,
    clientPubkey,
    psk,
    config,
  )
}
