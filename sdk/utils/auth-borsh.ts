import { Program, BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Dawn } from '../../target/types/dawn'
import { createHash } from 'crypto'
import * as borsh from '@coral-xyz/borsh'
import {
  PSKNetworkConfig,
  WIFI_SECURITY_STANDARD,
  WIFI_ENCRYPTION,
} from './types'
import { EAPParams } from './eap'
import { IPsecAHParams } from './ipsec'

/**
 * PSK Method Parameters layout using buffer-layout (Anchor's Borsh implementation)
 * Must match the Rust struct exactly!
 */
const PSKMethodParamsLayout = borsh.struct<{
  network_id_hash: Uint8Array
  security_standard: number
  encryption_algorithm: number
  psk_rotation_interval: number
  _reserved: Uint8Array
}>([
  borsh.array(borsh.u8(), 32, 'network_id_hash'), // [u8; 32]
  borsh.u8('security_standard'),
  borsh.u8('encryption_algorithm'),
  borsh.u32('psk_rotation_interval'),
  borsh.array(borsh.u8(), 64, '_reserved'), // [u8; 64]
])

/**
 * EAP Method Parameters layout
 * Must match the Rust EAPMethodParams struct!
 */
const EAPMethodParamsLayout = borsh.struct([
  borsh.publicKey('certificate_authority'), // Pubkey (32 bytes)
  borsh.u8('cipher_suite'),
  borsh.u8('eap_type'),
  borsh.publicKey('radius_server'), // Pubkey (32 bytes)
  borsh.u16('max_fragment_size'),
  borsh.u32('session_timeout'),
  borsh.bool('identity_privacy'),
  borsh.bool('validate_server_cert'),
  borsh.array(borsh.u8(), 64, '_reserved'), // [u8; 64]
])

/**
 * IPsec AH Method Parameters layout
 * Must match the Rust IPsecAHParams struct!
 */
const IPsecAHMethodParamsLayout = borsh.struct([
  borsh.u8('algorithm'),
  borsh.u32('key_lifetime'),
  borsh.u8('mode'),
  borsh.u32('spi'),
  borsh.u8('replay_window_size'),
  borsh.bool('use_extended_sequence'),
  // IKEv2 parameters (nested struct)
  borsh.u8('ike_dh_group'),
  borsh.u8('ike_encryption_algorithm'),
  borsh.u8('ike_integrity_algorithm'),
  borsh.u8('ike_prf_algorithm'),
  borsh.bool('ike_rekey'),
  borsh.u32('ike_lifetime_seconds'),
  borsh.array(borsh.u8(), 64, '_reserved'), // [u8; 64]
])

/**
 * Authentication Parameters Serializer using Borsh (Anchor-compatible)
 *
 * Uses @coral-xyz/borsh (buffer-layout) to serialize parameters matching the Rust struct format.
 */
export class AuthParamsSerializer {
  private program: Program<Dawn>

  constructor(program: Program<Dawn>) {
    this.program = program
  }

  /**
   * Serialize PSK method parameters using Borsh
   * @param config PSK network configuration
   * @returns Buffer containing Borsh-serialized parameters
   */
  serializePSKParams(config: PSKNetworkConfig): Buffer {
    const networkIdHash = this.generateNetworkIdHash(config.ssid)

    // Pad to 256 bytes (instruction expects fixed-size array)
    const buffer = Buffer.alloc(256)

    // Encode using buffer-layout
    // Note: Arrays must be regular JavaScript arrays, not Uint8Arrays for Borsh compatibility
    PSKMethodParamsLayout.encode(
      {
        network_id_hash: Array.from(networkIdHash),
        security_standard: WIFI_SECURITY_STANDARD[config.securityStandard],
        encryption_algorithm: WIFI_ENCRYPTION[config.encryptionAlgorithm],
        psk_rotation_interval: config.pskRotationInterval ?? 86400,
        _reserved: new Array(64).fill(0),
      },
      buffer,
    )

    return buffer
  }

  /**
   * Serialize EAP method parameters using Borsh
   * @param params EAP parameters
   * @returns Buffer containing Borsh-serialized parameters
   */
  serializeEAPParams(params: EAPParams): Buffer {
    const buffer = Buffer.alloc(256)

    EAPMethodParamsLayout.encode(
      {
        certificate_authority: params.certificateAuthority,
        cipher_suite: params.cipherSuite,
        eap_type: params.eapType,
        radius_server: params.radiusServer,
        max_fragment_size: params.maxFragmentSize,
        session_timeout: params.sessionTimeout,
        identity_privacy: params.identityPrivacy,
        validate_server_cert: params.validateServerCert,
        _reserved: new Array(64).fill(0),
      },
      buffer,
    )

    return buffer
  }

  /**
   * Serialize IPsec AH method parameters using Borsh
   * @param params IPsec AH parameters
   * @returns Buffer containing Borsh-serialized parameters
   */
  serializeIPsecAHParams(params: IPsecAHParams): Buffer {
    const buffer = Buffer.alloc(256)

    IPsecAHMethodParamsLayout.encode(
      {
        algorithm: params.algorithm,
        key_lifetime: params.keyLifetime,
        mode: params.mode,
        spi: params.spi,
        replay_window_size: params.replayWindowSize,
        use_extended_sequence: params.useExtendedSequence,
        // IKEv2 parameters (flattened)
        ike_dh_group: params.ikeParams.dhGroup,
        ike_encryption_algorithm: params.ikeParams.encryptionAlgorithm,
        ike_integrity_algorithm: params.ikeParams.integrityAlgorithm,
        ike_prf_algorithm: params.ikeParams.prfAlgorithm,
        ike_rekey: params.ikeParams.rekey,
        ike_lifetime_seconds: params.ikeParams.lifetimeSeconds,
        _reserved: new Array(64).fill(0),
      },
      buffer,
    )

    return buffer
  }

  /**
   * Generate network ID hash from SSID
   */
  private generateNetworkIdHash(ssid: string): Buffer {
    return createHash('sha256').update(ssid).digest()
  }
}

/**
 * Helper function to create PSK parameters for testing
 */
export function createPSKMethodParamsBorsh(
  program: Program<Dawn>,
  config: PSKNetworkConfig,
): Buffer {
  const serializer = new AuthParamsSerializer(program)
  return serializer.serializePSKParams(config)
}
