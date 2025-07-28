import { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Dawn } from '../../target/types/dawn'
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

/**
 * Structure representing EAP-TLS credential data
 */
export interface EAPTLSCredential {
  // Client identity used in EAP exchange
  identity: string
  // Reference to client certificate (could be fingerprint, ID or path)
  certificateRef: string
  // Optional certificate chain hash or identifier
  chainRef?: string
  // Reference to private key (handle/identifier, not the actual key)
  privateKeyRef: string
  // TLS version preference (1.2 or 1.3)
  tlsVersion: number
  // Supported cipher suites (from CipherSuite enum)
  supportedCipherSuites: CipherSuite[]
  // Optional OCSP stapling preference
  ocspStaplingEnabled?: boolean
  // Optional certificate verification method
  verificationMethod?: number
  // Optional client-side session timeout (in seconds)
  sessionTimeout?: number
}

/**
 * TLS Version constants
 */
export enum TLSVersion {
  TLS_1_2 = 2, // TLS 1.2
  TLS_1_3 = 3, // TLS 1.3
}

/**
 * Default EAP-TLS credential configuration with secure defaults
 */
export const DEFAULT_EAPTLS_CREDENTIAL: Omit<
  EAPTLSCredential,
  'identity' | 'certificateRef' | 'privateKeyRef'
> = {
  tlsVersion: TLSVersion.TLS_1_3,
  supportedCipherSuites: [
    CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
    CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
  ],
  ocspStaplingEnabled: true,
  verificationMethod: 1, // Standard X.509 validation
  sessionTimeout: 28800, // 8 hours in seconds
}

/**
 * Serializes an EAP-TLS credential into a buffer format suitable for on-chain storage
 * @param credential EAP-TLS credential to serialize
 * @returns Buffer containing serialized credential data (128 bytes)
 */
export function serializeEAPTLSCredential(
  credential: EAPTLSCredential,
): Buffer {
  // Initialize buffer with all zeros
  const buffer = Buffer.alloc(128)
  let offset = 0

  // Format version - allows for future format changes (1 byte)
  buffer[offset++] = 1

  // TLS version (1 byte)
  buffer[offset++] = credential.tlsVersion & 0xff

  // Write identity (max 32 bytes, null-terminated)
  const identityBuf = Buffer.from(credential.identity)
  const identityLen = Math.min(identityBuf.length, 31)
  identityBuf.copy(buffer, offset, 0, identityLen)
  offset += 32 // Fixed field size

  // Write certificate reference (max 32 bytes, null-terminated)
  const certRefBuf = Buffer.from(credential.certificateRef)
  const certRefLen = Math.min(certRefBuf.length, 31)
  certRefBuf.copy(buffer, offset, 0, certRefLen)
  offset += 32 // Fixed field size

  // Write private key reference (max 32 bytes, null-terminated)
  const keyRefBuf = Buffer.from(credential.privateKeyRef)
  const keyRefLen = Math.min(keyRefBuf.length, 31)
  keyRefBuf.copy(buffer, offset, 0, keyRefLen)
  offset += 32 // Fixed field size

  // Configuration flags (1 byte):
  // - bit 0: OCSP stapling enabled
  // - bit 1-3: verification method
  // - bits 4-7: reserved
  let configFlags = 0
  if (credential.ocspStaplingEnabled) {
    configFlags |= 1
  }
  if (credential.verificationMethod !== undefined) {
    configFlags |= (credential.verificationMethod & 0x07) << 1
  }
  buffer[offset++] = configFlags

  // Number of supported cipher suites (1 byte)
  buffer[offset++] = credential.supportedCipherSuites.length

  // Write supported cipher suites (up to 8 suites, 1 byte each)
  for (
    let i = 0;
    i < Math.min(credential.supportedCipherSuites.length, 8);
    i++
  ) {
    buffer[offset++] = credential.supportedCipherSuites[i]
  }
  // Skip to next section if fewer than 8 cipher suites
  offset = 100

  // Session timeout (4 bytes)
  if (credential.sessionTimeout !== undefined) {
    buffer.writeUInt32LE(credential.sessionTimeout, offset)
  }
  offset += 4

  // Chain reference (up to 16 bytes)
  if (credential.chainRef) {
    const chainRefBuf = Buffer.from(credential.chainRef)
    const chainRefLen = Math.min(chainRefBuf.length, 16)
    chainRefBuf.copy(buffer, offset, 0, chainRefLen)
  }
  // offset += 16; // We're at the end anyway

  return buffer
}

/**
 * Deserializes a buffer into an EAP-TLS credential
 * @param buffer Buffer containing serialized credential data
 * @returns Deserialized EAP-TLS credential
 */
export function deserializeEAPTLSCredential(buffer: Buffer): EAPTLSCredential {
  // Ensure buffer is at least 128 bytes
  if (buffer.length < 128) {
    throw new Error('Buffer too small for EAP-TLS credential')
  }

  let offset = 0

  // Format version (1 byte)
  const formatVersion = buffer[offset++]
  if (formatVersion !== 1) {
    throw new Error(`Unsupported credential format version: ${formatVersion}`)
  }

  // TLS version (1 byte)
  const tlsVersion = buffer[offset++]

  // Read identity (32 bytes, null-terminated)
  const identityBuf = buffer.slice(offset, offset + 32)
  const identityEnd = identityBuf.indexOf(0)
  const identity = identityBuf
    .slice(0, identityEnd === -1 ? 32 : identityEnd)
    .toString('utf8')
  offset += 32

  // Read certificate reference (32 bytes, null-terminated)
  const certRefBuf = buffer.slice(offset, offset + 32)
  const certRefEnd = certRefBuf.indexOf(0)
  const certificateRef = certRefBuf
    .slice(0, certRefEnd === -1 ? 32 : certRefEnd)
    .toString('utf8')
  offset += 32

  // Read private key reference (32 bytes, null-terminated)
  const keyRefBuf = buffer.slice(offset, offset + 32)
  const keyRefEnd = keyRefBuf.indexOf(0)
  const privateKeyRef = keyRefBuf
    .slice(0, keyRefEnd === -1 ? 32 : keyRefEnd)
    .toString('utf8')
  offset += 32

  // Configuration flags (1 byte)
  const configFlags = buffer[offset++]
  const ocspStaplingEnabled = (configFlags & 0x01) === 0x01
  const verificationMethod = (configFlags >> 1) & 0x07

  // Number of supported cipher suites (1 byte)
  const numCipherSuites = buffer[offset++]

  // Read supported cipher suites (up to 8 suites, 1 byte each)
  const supportedCipherSuites: CipherSuite[] = []
  for (let i = 0; i < numCipherSuites; i++) {
    supportedCipherSuites.push(buffer[offset++] as CipherSuite)
  }

  // Skip to next section
  offset = 100

  // Session timeout (4 bytes)
  const sessionTimeout = buffer.readUInt32LE(offset)
  offset += 4

  // Chain reference (up to 16 bytes, null-terminated)
  const chainRefBuf = buffer.slice(offset, offset + 16)
  const chainRefEnd = chainRefBuf.indexOf(0)
  const chainRef =
    chainRefEnd === -1 ? '' : chainRefBuf.slice(0, chainRefEnd).toString('utf8')

  return {
    identity,
    certificateRef,
    privateKeyRef,
    tlsVersion,
    supportedCipherSuites,
    ocspStaplingEnabled,
    verificationMethod,
    sessionTimeout: sessionTimeout || undefined,
    chainRef: chainRef || undefined,
  }
}

/**
 * Generates an EAP-TLS credential with secure defaults for production use
 * @param identity Client identity to use in EAP exchange
 * @param certificatePath Path or reference to client certificate
 * @param privateKeyPath Path or reference to private key
 * @returns EAP-TLS credential ready for serialization
 */
export function generateEAPTLSCredential(
  identity: string,
  certificatePath: string,
  privateKeyPath: string,
): EAPTLSCredential {
  return {
    identity,
    certificateRef: certificatePath,
    privateKeyRef: privateKeyPath,
    ...DEFAULT_EAPTLS_CREDENTIAL,
  }
}

/**
 * Validates an EAP-TLS credential for correctness
 * @param credential EAP-TLS credential to validate
 * @returns true if credential is valid, otherwise throws error
 */
export function validateEAPTLSCredential(
  credential: EAPTLSCredential,
): boolean {
  if (!credential.identity || credential.identity.length === 0) {
    throw new Error('Identity cannot be empty')
  }

  if (!credential.certificateRef || credential.certificateRef.length === 0) {
    throw new Error('Certificate reference cannot be empty')
  }

  if (!credential.privateKeyRef || credential.privateKeyRef.length === 0) {
    throw new Error('Private key reference cannot be empty')
  }

  if (
    credential.tlsVersion !== TLSVersion.TLS_1_2 &&
    credential.tlsVersion !== TLSVersion.TLS_1_3
  ) {
    throw new Error(`Invalid TLS version: ${credential.tlsVersion}`)
  }

  if (
    !credential.supportedCipherSuites ||
    credential.supportedCipherSuites.length === 0
  ) {
    throw new Error('At least one cipher suite must be specified')
  }

  return true
}
