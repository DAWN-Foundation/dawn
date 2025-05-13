import { Program } from '@coral-xyz/anchor'
import { PublicKey, Keypair, TransactionSignature } from '@solana/web3.js'
import { Dawn } from '../../target/types/dawn'
import { getAuthMethodPda } from './pda'
import { AuthMethodType } from './helpers'

/**
 * EAP Type constants for 802.1x authentication
 */
export enum EAPType {
  EAP_TLS = 0, // Certificate-based
  PEAP_MSCHAPV2 = 1, // Password-based
  EAP_TTLS = 2, // Tunneled TLS
}

/**
 * Cipher Suite constants for TLS encryption
 */
export enum CipherSuite {
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 = 0,
  TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 = 1,
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 = 2,
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 = 3,
  TLS_DHE_RSA_WITH_AES_128_GCM_SHA256 = 4,
  TLS_DHE_RSA_WITH_AES_256_GCM_SHA384 = 5,
}

/**
 * Interface representing the EAP authentication method parameters
 */
export interface EAPParams {
  certificateAuthority: PublicKey
  cipherSuite: CipherSuite
  eapType: EAPType
  radiusServer: PublicKey
  maxFragmentSize: number
  sessionTimeout: number
  identityPrivacy: boolean
  validateServerCert: boolean
  reserved?: Buffer
}

/**
 * Default EAP parameters with recommended secure values
 */
export const DEFAULT_EAP_PARAMS: Omit<
  EAPParams,
  'certificateAuthority' | 'radiusServer'
> = {
  cipherSuite: CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
  eapType: EAPType.EAP_TLS,
  maxFragmentSize: 1400, // Reasonable size for Ethernet frames
  sessionTimeout: 3600, // 1 hour in seconds
  identityPrivacy: true, // Use anonymous identity for privacy
  validateServerCert: true, // Validate server certificate for security
}

/**
 * Serializes EAP parameters into a buffer for on-chain storage
 * @param params EAP parameters to serialize
 * @returns Buffer containing serialized parameters
 */
export function serializeEAPParams(params: EAPParams): Buffer {
  const buffer = Buffer.alloc(256)
  let offset = 0

  // certificate_authority: Pubkey (32 bytes)
  params.certificateAuthority.toBuffer().copy(buffer, offset)
  offset += 32

  // cipher_suite: u8 (1 byte)
  buffer[offset] = params.cipherSuite
  offset += 1

  // eap_type: u8 (1 byte)
  buffer[offset] = params.eapType
  offset += 1

  // radius_server: Pubkey (32 bytes)
  params.radiusServer.toBuffer().copy(buffer, offset)
  offset += 32

  // max_fragment_size: u16 (2 bytes)
  buffer.writeUInt16LE(params.maxFragmentSize, offset)
  offset += 2

  // session_timeout: u32 (4 bytes)
  buffer.writeUInt32LE(params.sessionTimeout, offset)
  offset += 4

  // identity_privacy: bool (1 byte)
  buffer[offset] = params.identityPrivacy ? 1 : 0
  offset += 1

  // validate_server_cert: bool (1 byte)
  buffer[offset] = params.validateServerCert ? 1 : 0
  offset += 1

  // _reserved: remaining bytes
  if (params.reserved) {
    params.reserved.copy(buffer, offset)
  }

  return buffer
}

/**
 * Deserializes a buffer into EAP parameters
 * @param buffer Buffer containing serialized parameters
 * @returns Deserialized EAP parameters
 */
export function deserializeEAPParams(buffer: Buffer): EAPParams {
  let offset = 0

  // certificate_authority: Pubkey (32 bytes)
  const certificateAuthority = new PublicKey(buffer.slice(offset, offset + 32))
  offset += 32

  // cipher_suite: u8 (1 byte)
  const cipherSuite = buffer[offset] as CipherSuite
  offset += 1

  // eap_type: u8 (1 byte)
  const eapType = buffer[offset] as EAPType
  offset += 1

  // radius_server: Pubkey (32 bytes)
  const radiusServer = new PublicKey(buffer.slice(offset, offset + 32))
  offset += 32

  // max_fragment_size: u16 (2 bytes)
  const maxFragmentSize = buffer.readUInt16LE(offset)
  offset += 2

  // session_timeout: u32 (4 bytes)
  const sessionTimeout = buffer.readUInt32LE(offset)
  offset += 4

  // identity_privacy: bool (1 byte)
  const identityPrivacy = buffer[offset] === 1
  offset += 1

  // validate_server_cert: bool (1 byte)
  const validateServerCert = buffer[offset] === 1
  offset += 1

  // _reserved: remaining bytes
  const reserved = buffer.slice(offset)

  return {
    certificateAuthority,
    cipherSuite,
    eapType,
    radiusServer,
    maxFragmentSize,
    sessionTimeout,
    identityPrivacy,
    validateServerCert,
    reserved,
  }
}

/**
 * Validates EAP parameters to ensure they are within allowed ranges
 * @param params EAP parameters to validate
 * @returns True if parameters are valid, otherwise throws an error
 */
export function validateEAPParams(params: EAPParams): boolean {
  // Check cipher suite is valid
  if (params.cipherSuite < 0 || params.cipherSuite > 5) {
    throw new Error(`Invalid cipher suite: ${params.cipherSuite}`)
  }

  // Check EAP type is valid
  if (params.eapType < 0 || params.eapType > 2) {
    throw new Error(`Invalid EAP type: ${params.eapType}`)
  }

  // Check fragment size is reasonable (256-4096 bytes)
  if (params.maxFragmentSize < 256 || params.maxFragmentSize > 4096) {
    throw new Error(`Invalid fragment size: ${params.maxFragmentSize}`)
  }

  // Check session timeout is reasonable (300-86400 seconds, 5 min to 24 hours)
  if (params.sessionTimeout < 300 || params.sessionTimeout > 86400) {
    throw new Error(`Invalid session timeout: ${params.sessionTimeout}`)
  }

  return true
}

/**
 * Fetches and deserializes EAP parameters from an auth method account
 * @param program Anchor program instance
 * @param authMethodAddress Address of the auth method account
 * @returns Deserialized EAP parameters if method type is EAP, otherwise null
 */
export async function fetchEAPParams(
  program: Program<Dawn>,
  authMethodAddress: PublicKey,
): Promise<EAPParams | null> {
  try {
    const authMethod = await program.account.authMethod.fetch(authMethodAddress)

    // Check if method type is EAP
    if (!authMethod.methodType.eap) {
      console.log('Auth method is not EAP')
      return null
    }

    // Convert parameters array to buffer
    const paramsBuffer = Buffer.from(authMethod.parameters)

    // Deserialize parameters
    return deserializeEAPParams(paramsBuffer)
  } catch (error) {
    console.error('Error fetching EAP parameters:', error)
    throw error
  }
}
