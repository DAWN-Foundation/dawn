import { PublicKey } from '@solana/web3.js'
import { createHash } from 'crypto'
import {
  PSKCredentialData,
  PSKMethodParams,
  PSKNetworkConfig,
  WIFI_SECURITY_STANDARD,
  WIFI_ENCRYPTION,
} from './types'

/**
 * Generate a network ID hash from SSID
 */
export function generateNetworkIdHash(ssid: string): number[] {
  const hash = createHash('sha256').update(ssid).digest()
  return Array.from(hash)
}

/**
 * Compute SHA-256 hash of client_pubkey || psk_utf8
 * Using client pubkey as salt for space efficiency
 */
export function computePskHash(clientPubkey: PublicKey, psk: string): Buffer {
  const pskBuffer = Buffer.from(psk, 'utf8')
  const input = Buffer.concat([clientPubkey.toBuffer(), pskBuffer])

  return createHash('sha256').update(input).digest()
}

/**
 * Serialize PSK credential data for on-chain storage
 */
export function serializePskCredentialData(encryptedPsk: Uint8Array): Buffer {
  const buffer = Buffer.alloc(128)

  // encryptedPsk: 64 bytes
  Buffer.from(encryptedPsk).copy(buffer, 0)

  // reserved: 64 bytes (rest of buffer is already zeroed)

  return buffer
}

/**
 * Deserialize PSK credential data from on-chain storage
 */
export function deserializePskCredentialData(
  buffer: Buffer,
): PSKCredentialData {
  if (buffer.length < 128) {
    throw new Error(
      'Buffer too small for PSK credential data - expected 128 bytes',
    )
  }

  return {
    pskHash: buffer.subarray(0, 32),
    _reserved: buffer.subarray(32, 128),
  }
}

/**
 * Verify PSK knowledge by recomputing hash (requires client pubkey as salt)
 */
export function verifyPskCredential(
  credentialData: PSKCredentialData,
  psk: string,
  clientPubkey: PublicKey,
): boolean {
  const computedHash = computePskHash(clientPubkey, psk)
  return computedHash.equals(credentialData.pskHash)
}

/**
 * Create PSK method parameters from network configuration
 */
export function createPSKMethodParams(
  config: PSKNetworkConfig,
): PSKMethodParams {
  const networkIdHash = generateNetworkIdHash(config.ssid)

  return {
    networkIdHash,
    securityStandard: WIFI_SECURITY_STANDARD[config.securityStandard],
    encryptionAlgorithm: WIFI_ENCRYPTION[config.encryptionAlgorithm],
    pskRotationInterval: config.pskRotationInterval ?? 86400, // 24 hours default
  }
}

/**
 * Create secure PSK parameters for production use
 */
export function createSecurePSKMethodParams(ssid: string): PSKMethodParams {
  const networkIdHash = generateNetworkIdHash(ssid)

  return {
    networkIdHash,
    securityStandard: WIFI_SECURITY_STANDARD.WPA3_PSK,
    encryptionAlgorithm: WIFI_ENCRYPTION.AES_GCMP_256,
    pskRotationInterval: 3600, // 1 hour rotation
  }
}

/**
 * Serialize PSK parameters to buffer for on-chain storage
 */
export function serializePSKMethodParams(params: PSKMethodParams): Buffer {
  const buffer = Buffer.alloc(256)
  let offset = 0

  // networkIdHash: [u8; 32]
  Buffer.from(params.networkIdHash).copy(buffer, offset)
  offset += 32

  // securityStandard: u8
  buffer.writeUInt8(params.securityStandard, offset)
  offset += 1

  // encryptionAlgorithm: u8
  buffer.writeUInt8(params.encryptionAlgorithm, offset)
  offset += 1

  // pskRotationInterval: u32
  buffer.writeUInt32LE(params.pskRotationInterval, offset)
  offset += 4

  return buffer
}

/**
 * Validate PSK parameters
 */
export function validatePSKMethodParams(params: PSKMethodParams): void {
  // Validate security standard
  if (params.securityStandard > WIFI_SECURITY_STANDARD.WPA3_PSK) {
    throw new Error('Invalid security standard')
  }

  // Validate encryption algorithm
  if (params.encryptionAlgorithm > WIFI_ENCRYPTION.AES_GCMP_256) {
    throw new Error('Invalid encryption algorithm')
  }

  // Validate PSK rotation interval
  if (
    params.pskRotationInterval !== 0 &&
    (params.pskRotationInterval < 3600 || params.pskRotationInterval > 604800)
  ) {
    throw new Error('Invalid rotation interval')
  }
}
