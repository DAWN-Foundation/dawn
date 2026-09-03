// @ts-nocheck
import { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Dawn } from '../../target/types/dawn'
import { AuthMethodType } from './helpers'
import { getConnectionPda } from '../pda'

/**
 * IPsec Authentication Header (AH) algorithms
 */
export enum IPsecAlgorithm {
  HMAC_MD5_96 = 0, // RFC 2403 (legacy, not recommended for new implementations)
  HMAC_SHA1_96 = 1, // RFC 2404 (legacy, not recommended for new implementations)
  HMAC_SHA256_128 = 2, // RFC 4868
  HMAC_SHA384_192 = 3, // RFC 4868
  HMAC_SHA512_256 = 4, // RFC 4868
  AES_XCBC_96 = 5, // RFC 3566
  AES_CMAC_96 = 6, // RFC 4494
  AES_GMAC_128 = 7, // RFC 4543
  BLAKE2S_128 = 8, // RFC 7693 (compact and high performance)
}

/**
 * IPsec modes of operation
 */
export enum IPsecMode {
  TRANSPORT = 0, // End-to-end security between hosts
  TUNNEL = 1, // Gateway-to-gateway or host-to-gateway security
}

/**
 * IKEv2 parameters for key exchange
 */
export interface IKEv2Params {
  dhGroup: number // Diffie-Hellman group number
  encryptionAlgorithm: number // Encryption algorithm identifier
  integrityAlgorithm: number // Integrity algorithm identifier
  prfAlgorithm: number // Pseudo-random function algorithm
  rekey: boolean // Enable automatic rekeying
  lifetimeSeconds: number // SA lifetime in seconds
}

/**
 * Interface representing IPsec Authentication Header parameters
 */
export interface IPsecAHParams {
  algorithm: IPsecAlgorithm // Authentication algorithm
  keyLifetime: number // Key lifetime in seconds
  mode: IPsecMode // Transport or Tunnel mode
  spi: number // Security Parameter Index
  replayWindowSize: number // Anti-replay window size
  useExtendedSequence: boolean // Use 64-bit extended sequence numbers
  ikeParams: IKEv2Params // IKEv2 parameters for key exchange
  reserved?: Buffer // Reserved for future extensions
}

/**
 * Default IPsec AH parameters with recommended secure values
 */
export const DEFAULT_IPSEC_AH_PARAMS: IPsecAHParams = {
  algorithm: IPsecAlgorithm.HMAC_SHA256_128,
  keyLifetime: 28800, // 8 hours in seconds
  mode: IPsecMode.TRANSPORT,
  spi: Math.floor(Math.random() * 0xffffffff), // Random SPI
  replayWindowSize: 64,
  useExtendedSequence: true,
  ikeParams: {
    dhGroup: 14, // 2048-bit MODP Group
    encryptionAlgorithm: 12, // AES-GCM with 16 octet ICV
    integrityAlgorithm: 12, // HMAC-SHA256-128
    prfAlgorithm: 5, // PRF-HMAC-SHA2-256
    rekey: true,
    lifetimeSeconds: 28800, // 8 hours
  },
}

/**
 * Serializes IPsec AH parameters into a buffer for on-chain storage
 * @param params IPsec AH parameters to serialize
 * @returns Buffer containing serialized parameters
 */
export function serializeIPsecAHParams(params: IPsecAHParams): Buffer {
  const buffer = Buffer.alloc(256)
  let offset = 0

  // algorithm: u8 (1 byte)
  buffer[offset] = params.algorithm
  offset += 1

  // keyLifetime: u32 (4 bytes)
  buffer.writeUInt32LE(params.keyLifetime, offset)
  offset += 4

  // mode: u8 (1 byte)
  buffer[offset] = params.mode
  offset += 1

  // spi: u32 (4 bytes)
  buffer.writeUInt32LE(params.spi, offset)
  offset += 4

  // replayWindowSize: u8 (1 byte)
  buffer[offset] = params.replayWindowSize
  offset += 1

  // useExtendedSequence: bool (1 byte)
  buffer[offset] = params.useExtendedSequence ? 1 : 0
  offset += 1

  // IKEv2 parameters
  // dhGroup: u8 (1 byte)
  buffer[offset] = params.ikeParams.dhGroup
  offset += 1

  // encryptionAlgorithm: u8 (1 byte)
  buffer[offset] = params.ikeParams.encryptionAlgorithm
  offset += 1

  // integrityAlgorithm: u8 (1 byte)
  buffer[offset] = params.ikeParams.integrityAlgorithm
  offset += 1

  // prfAlgorithm: u8 (1 byte)
  buffer[offset] = params.ikeParams.prfAlgorithm
  offset += 1

  // rekey: bool (1 byte)
  buffer[offset] = params.ikeParams.rekey ? 1 : 0
  offset += 1

  // lifetimeSeconds: u32 (4 bytes)
  buffer.writeUInt32LE(params.ikeParams.lifetimeSeconds, offset)
  offset += 4

  // reserved: remaining bytes
  if (params.reserved) {
    params.reserved.copy(buffer, offset)
  }

  return buffer
}

/**
 * Deserializes a buffer into IPsec AH parameters
 * @param buffer Buffer containing serialized parameters
 * @returns Deserialized IPsec AH parameters
 */
export function deserializeIPsecAHParams(buffer: Buffer): IPsecAHParams {
  let offset = 0

  // algorithm: u8 (1 byte)
  const algorithm = buffer[offset] as IPsecAlgorithm
  offset += 1

  // keyLifetime: u32 (4 bytes)
  const keyLifetime = buffer.readUInt32LE(offset)
  offset += 4

  // mode: u8 (1 byte)
  const mode = buffer[offset] as IPsecMode
  offset += 1

  // spi: u32 (4 bytes)
  const spi = buffer.readUInt32LE(offset)
  offset += 4

  // replayWindowSize: u8 (1 byte)
  const replayWindowSize = buffer[offset]
  offset += 1

  // useExtendedSequence: bool (1 byte)
  const useExtendedSequence = buffer[offset] === 1
  offset += 1

  // IKEv2 parameters
  // dhGroup: u8 (1 byte)
  const dhGroup = buffer[offset]
  offset += 1

  // encryptionAlgorithm: u8 (1 byte)
  const encryptionAlgorithm = buffer[offset]
  offset += 1

  // integrityAlgorithm: u8 (1 byte)
  const integrityAlgorithm = buffer[offset]
  offset += 1

  // prfAlgorithm: u8 (1 byte)
  const prfAlgorithm = buffer[offset]
  offset += 1

  // rekey: bool (1 byte)
  const rekey = buffer[offset] === 1
  offset += 1

  // lifetimeSeconds: u32 (4 bytes)
  const lifetimeSeconds = buffer.readUInt32LE(offset)
  offset += 4

  // reserved: remaining bytes
  const reserved = buffer.slice(offset)

  return {
    algorithm,
    keyLifetime,
    mode,
    spi,
    replayWindowSize,
    useExtendedSequence,
    ikeParams: {
      dhGroup,
      encryptionAlgorithm,
      integrityAlgorithm,
      prfAlgorithm,
      rekey,
      lifetimeSeconds,
    },
    reserved,
  }
}

/**
 * Structure representing IPsec Authentication Header (AH) credential data
 */
export interface IPsecAHCredential {
  // Shared key identity (key ID or reference)
  keyId: string
  // Pre-shared key hash or reference (not the actual key)
  pskRef: string
  // Optional Security Parameter Index override
  spiOverride?: number
  // Authentication algorithm preference
  preferredAlgorithm: IPsecAlgorithm
  // Anti-replay window size preference
  preferredWindowSize: number
  // Use extended sequence numbers
  useExtendedSequence: boolean
  // Reserved for future use
  reserved?: Buffer
}

/**
 * Default IPsec AH credential with secure defaults
 */
export const DEFAULT_IPSEC_AH_CREDENTIAL: Omit<
  IPsecAHCredential,
  'keyId' | 'pskRef'
> = {
  preferredAlgorithm: IPsecAlgorithm.HMAC_SHA256_128,
  preferredWindowSize: 64,
  useExtendedSequence: true,
}

/**
 * Serializes an IPsec AH credential into a buffer format suitable for on-chain storage
 * @param credential IPsec AH credential to serialize
 * @returns Buffer containing serialized credential data (64 bytes)
 */
export function serializeIPsecAHCredential(
  credential: IPsecAHCredential,
): Buffer {
  const buffer = Buffer.alloc(64)
  let offset = 0

  // Format version (1 byte)
  buffer[offset++] = 1

  // Write key ID (max 24 bytes, null-terminated)
  const keyIdBuf = Buffer.from(credential.keyId)
  const keyIdLen = Math.min(keyIdBuf.length, 23)
  keyIdBuf.copy(buffer, offset, 0, keyIdLen)
  offset += 24 // Fixed field size

  // Write PSK reference (max 24 bytes, null-terminated)
  const pskRefBuf = Buffer.from(credential.pskRef)
  const pskRefLen = Math.min(pskRefBuf.length, 23)
  pskRefBuf.copy(buffer, offset, 0, pskRefLen)
  offset += 24 // Fixed field size

  // SPI override (4 bytes)
  if (credential.spiOverride !== undefined) {
    buffer.writeUInt32LE(credential.spiOverride, offset)
  }
  offset += 4

  // Preferred algorithm (1 byte)
  buffer[offset++] = credential.preferredAlgorithm

  // Preferred window size (1 byte)
  buffer[offset++] = credential.preferredWindowSize

  // Use extended sequence (1 byte)
  buffer[offset++] = credential.useExtendedSequence ? 1 : 0

  // Reserved fields (remaining bytes)
  if (credential.reserved) {
    const reservedLen = Math.min(
      credential.reserved.length,
      buffer.length - offset,
    )
    credential.reserved.copy(buffer, offset, 0, reservedLen)
  }

  return buffer
}

/**
 * Deserializes a buffer into an IPsec AH credential
 * @param buffer Buffer containing serialized credential data
 * @returns Deserialized IPsec AH credential
 */
export function deserializeIPsecAHCredential(
  buffer: Buffer,
): IPsecAHCredential {
  if (buffer.length < 64) {
    throw new Error('Buffer too small for IPsec AH credential')
  }

  let offset = 0

  // Format version (1 byte)
  const formatVersion = buffer[offset++]
  if (formatVersion !== 1) {
    throw new Error(`Unsupported credential format version: ${formatVersion}`)
  }

  // Read key ID (24 bytes, null-terminated)
  const keyIdBuf = buffer.slice(offset, offset + 24)
  const keyIdEnd = keyIdBuf.indexOf(0)
  const keyId = keyIdBuf
    .slice(0, keyIdEnd === -1 ? 24 : keyIdEnd)
    .toString('utf8')
  offset += 24

  // Read PSK reference (24 bytes, null-terminated)
  const pskRefBuf = buffer.slice(offset, offset + 24)
  const pskRefEnd = pskRefBuf.indexOf(0)
  const pskRef = pskRefBuf
    .slice(0, pskRefEnd === -1 ? 24 : pskRefEnd)
    .toString('utf8')
  offset += 24

  // SPI override (4 bytes)
  const spiOverride = buffer.readUInt32LE(offset)
  offset += 4

  // Preferred algorithm (1 byte)
  const preferredAlgorithm = buffer[offset++] as IPsecAlgorithm

  // Preferred window size (1 byte)
  const preferredWindowSize = buffer[offset++]

  // Use extended sequence (1 byte)
  const useExtendedSequence = buffer[offset++] === 1

  // Reserved (remaining bytes)
  const reserved = buffer.slice(offset)

  return {
    keyId,
    pskRef,
    spiOverride: spiOverride === 0 ? undefined : spiOverride,
    preferredAlgorithm,
    preferredWindowSize,
    useExtendedSequence,
    reserved: reserved.length > 0 ? reserved : undefined,
  }
}

/**
 * Generates an IPsec AH credential with secure defaults
 * @param keyId Key identifier
 * @param pskRef Pre-shared key reference
 * @returns IPsec AH credential ready for serialization
 */
export function generateIPsecAHCredential(
  keyId: string,
  pskRef: string,
): IPsecAHCredential {
  return {
    keyId,
    pskRef,
    ...DEFAULT_IPSEC_AH_CREDENTIAL,
  }
}

/**
 * Validates IPsec AH parameters to ensure they are within allowed ranges
 * @param params IPsec AH parameters to validate
 * @returns True if parameters are valid, otherwise throws an error
 */
export function validateIPsecAHParams(params: IPsecAHParams): boolean {
  // Check algorithm is valid
  if (params.algorithm < 0 || params.algorithm > 8) {
    throw new Error(`Invalid IPsec algorithm: ${params.algorithm}`)
  }

  // Check key lifetime is reasonable (300-86400 seconds, 5 min to 24 hours)
  if (params.keyLifetime < 300 || params.keyLifetime > 86400) {
    throw new Error(`Invalid key lifetime: ${params.keyLifetime}`)
  }

  // Check mode is valid
  if (params.mode !== IPsecMode.TRANSPORT && params.mode !== IPsecMode.TUNNEL) {
    throw new Error(`Invalid IPsec mode: ${params.mode}`)
  }

  // Check replay window size is valid (must be power of 2)
  if (
    params.replayWindowSize < 4 ||
    params.replayWindowSize > 256 ||
    (params.replayWindowSize & (params.replayWindowSize - 1)) !== 0
  ) {
    throw new Error(`Invalid replay window size: ${params.replayWindowSize}`)
  }

  // Validate IKE params
  if (params.ikeParams.dhGroup < 1 || params.ikeParams.dhGroup > 31) {
    throw new Error(`Invalid DH group: ${params.ikeParams.dhGroup}`)
  }

  return true
}

/**
 * Fetches and deserializes IPsec AH parameters from an auth method account
 * @param program Anchor program instance
 * @param authMethodAddress Address of the auth method account
 * @returns Deserialized IPsec AH parameters if method type is IPSEC_AH, otherwise null
 */
export async function fetchIPsecAHParams(
  program: Program<Dawn>,
  authMethodAddress: PublicKey,
): Promise<IPsecAHParams | null> {
  try {
    const authMethod = await program.account.authMethod.fetch(authMethodAddress)

    // Check if method type is IPSEC_AH
    if (!authMethod.methodType.ipsecAh) {
      console.log('Auth method is not IPsec AH')
      return null
    }

    // Convert parameters array to buffer
    const paramsBuffer = Buffer.from(authMethod.parameters)

    // Deserialize parameters
    return deserializeIPsecAHParams(paramsBuffer)
  } catch (error) {
    console.error('Error fetching IPsec AH parameters:', error)
    throw error
  }
}

/**
 * Fetches a connection credential and deserializes the IPsec AH credential data
 * @param program Anchor program instance
 * @param entityA First entity public key
 * @param entityB Second entity public key
 * @param authMethod Auth method public key
 * @returns Connection with deserialized credential data for both entities
 */
export async function fetchIPsecAHConnection(
  program: Program<Dawn>,
  entityA: PublicKey,
  entityB: PublicKey,
  authMethod: PublicKey,
): Promise<{
  connection: any
  entityACredential: IPsecAHCredential
  entityBCredential: IPsecAHCredential
} | null> {
  try {
    const connectionPda = getConnectionPda(
      program,
      authMethod,
      entityA,
      entityB,
    )

    const connection = await program.account.connection.fetch(connectionPda)

    // Deserialize credential data for both entities
    const entityACredential = deserializeIPsecAHCredential(
      Buffer.from(connection.credentialDataA),
    )
    const entityBCredential = deserializeIPsecAHCredential(
      Buffer.from(connection.credentialDataB),
    )

    return {
      connection,
      entityACredential,
      entityBCredential,
    }
  } catch (error) {
    console.error('Error fetching IPsec AH connection:', error)
    return null
  }
}
