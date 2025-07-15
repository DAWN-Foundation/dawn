import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Dawn } from "../../target/types/dawn";
import { mock } from "../utils";
import { createHash } from "crypto";

/// PSK credential structure stored in the Credential account
/// Format: [hash: 32 bytes][reserved: 96 bytes] = 128 bytes
/// Hash is computed as: SHA-256(client_pubkey || psk_utf8)
export interface PSKCredentialData {
  pskHash: Buffer;
  _reserved: Buffer;
}

export interface WiFiSecurityStandard {
  WPA2_PSK: number;
  WPA3_PSK: number;
}

export interface WiFiEncryption {
  AES_CCMP: number;
  AES_GCMP: number;
  AES_GCMP_256: number;
}

export const WIFI_SECURITY_STANDARD: WiFiSecurityStandard = {
  WPA2_PSK: 0,
  WPA3_PSK: 1,
};

export const WIFI_ENCRYPTION: WiFiEncryption = {
  AES_CCMP: 0,
  AES_GCMP: 1,
  AES_GCMP_256: 2,
};

export interface PSKMethodParams {
  networkIdHash: number[];
  securityStandard: number;
  encryptionAlgorithm: number;
  pskRotationInterval: number;
}

export interface PSKNetworkConfig {
  ssid: string;
  securityStandard: keyof WiFiSecurityStandard;
  encryptionAlgorithm: keyof WiFiEncryption;
  pskRotationInterval?: number;
}

/**
 * Generate a network ID hash from SSID
 */
export function generateNetworkIdHash(ssid: string): number[] {
  const hash = createHash('sha256').update(ssid).digest();
  return Array.from(hash);
}

/**
 * Compute SHA-256 hash of client_pubkey || psk_utf8
 * Using client pubkey as salt for space efficiency
 */
export function computePskHash(clientPubkey: PublicKey, psk: string): Buffer {
  const pskBuffer = Buffer.from(psk, 'utf8');
  const input = Buffer.concat([clientPubkey.toBuffer(), pskBuffer]);
  
  return createHash('sha256').update(input).digest();
}

/**
 * Create PSK credential data with hash (using client pubkey as salt)
 */
export function createPskCredentialData(
  psk: string,
  clientPubkey: PublicKey
): PSKCredentialData {
  const pskHash = computePskHash(clientPubkey, psk);
  const _reserved = Buffer.alloc(96); // Increased from 64 to 96 bytes

  return {
    pskHash,
    _reserved,
  };
}

/**
 * Serialize PSK credential data for on-chain storage
 */
export function serializePskCredentialData(data: PSKCredentialData): Buffer {
  const buffer = Buffer.alloc(128);
  
  // psk_hash: 32 bytes  
  data.pskHash.copy(buffer, 0);
  
  // reserved: 96 bytes (rest of buffer is already zeroed)
  
  return buffer;
}

/**
 * Deserialize PSK credential data from on-chain storage
 */
export function deserializePskCredentialData(buffer: Buffer): PSKCredentialData {
  if (buffer.length < 128) {
    throw new Error("Buffer too small for PSK credential data - expected 128 bytes");
  }

  return {
    pskHash: buffer.subarray(0, 32),
    _reserved: buffer.subarray(32, 128),
  };
}

/**
 * Verify PSK knowledge by recomputing hash (requires client pubkey as salt)
 */
export function verifyPskCredential(
  credentialData: PSKCredentialData,
  psk: string,
  clientPubkey: PublicKey
): boolean {
  const computedHash = computePskHash(clientPubkey, psk);
  return computedHash.equals(credentialData.pskHash);
}

/**
 * Create PSK method parameters from network configuration
 */
export function createPSKMethodParams(config: PSKNetworkConfig): PSKMethodParams {
  const networkIdHash = generateNetworkIdHash(config.ssid);

  return {
    networkIdHash,
    securityStandard: WIFI_SECURITY_STANDARD[config.securityStandard],
    encryptionAlgorithm: WIFI_ENCRYPTION[config.encryptionAlgorithm],
    pskRotationInterval: config.pskRotationInterval ?? 86400, // 24 hours default
  };
}

/**
 * Create secure PSK parameters for production use
 */
export function createSecurePSKMethodParams(ssid: string): PSKMethodParams {
  const networkIdHash = generateNetworkIdHash(ssid);

  return {
    networkIdHash,
    securityStandard: WIFI_SECURITY_STANDARD.WPA3_PSK,
    encryptionAlgorithm: WIFI_ENCRYPTION.AES_GCMP_256,
    pskRotationInterval: 3600, // 1 hour rotation
  };
}

/**
 * Serialize PSK parameters to buffer for on-chain storage
 */
export function serializePSKMethodParams(params: PSKMethodParams): Buffer {
  const buffer = Buffer.alloc(256);
  let offset = 0;

  // networkIdHash: [u8; 32]
  Buffer.from(params.networkIdHash).copy(buffer, offset);
  offset += 32;

  // securityStandard: u8
  buffer.writeUInt8(params.securityStandard, offset);
  offset += 1;

  // encryptionAlgorithm: u8
  buffer.writeUInt8(params.encryptionAlgorithm, offset);
  offset += 1;

  // pskRotationInterval: u32
  buffer.writeUInt32LE(params.pskRotationInterval, offset);
  offset += 4;

  return buffer;
}

/**
 * Get the PDA for a PSK authentication method
 */
export function getPskAuthMethodPda(
  program: Program<Dawn>,
  authority: PublicKey,
  plan: PublicKey,
  parameters: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("auth_method"),
      authority.toBuffer(),
      Buffer.from([0]), // PSK method type seed
      plan.toBuffer(),
      parameters.slice(0, 32), // MAX_SEED_LEN
    ],
    program.programId
  );
}

/**
 * Register PSK authentication method (only network parameters, no PSK)
 */
export async function registerPskAuthMethod(
  program: Program<Dawn>,
  authority: PublicKey,
  plan: PublicKey,
  config: PSKNetworkConfig
): Promise<{ signature: string; authMethodPda: PublicKey }> {
  const networkIdHash = generateNetworkIdHash(config.ssid);
  
  // Create parameters without PSK salt (now per-credential)
  const params = {
    networkIdHash: Array.from(networkIdHash),
    securityStandard: WIFI_SECURITY_STANDARD[config.securityStandard],
    encryptionAlgorithm: WIFI_ENCRYPTION[config.encryptionAlgorithm],
    pskRotationInterval: config.pskRotationInterval ?? 86400,
  };

  const parametersBuffer = serializePSKMethodParams(params);
  const [authMethodPda] = getPskAuthMethodPda(program, authority, plan, parametersBuffer);

  const signature = await program.methods
    .registerAuthMethod(
      { psk: {} },
      Array.from(parametersBuffer)
    )
    .accountsPartial({
      caller: authority,
      config: mock.configPda,
      plan: plan,
      authMethod: authMethodPda,
    })
    .rpc();

  return { signature, authMethodPda };
}

/**
 * Register PSK credential for a client (with hash using client pubkey as salt)
 */
export async function registerPskCredential(
  program: Program<Dawn>,
  authority: PublicKey,
  authMethodPda: PublicKey,
  clientPubkey: PublicKey,
  psk: string,
  metadata?: Buffer
): Promise<{ signature: string; credentialPda: PublicKey }> {
  // Create credential data with hash (using client pubkey as salt)
  const credentialData = createPskCredentialData(psk, clientPubkey);
  const serializedData = serializePskCredentialData(credentialData);

  const [credentialPda] = getCredentialPda(program, authMethodPda, clientPubkey);

  const signature = await program.methods
    .registerCredential(
      clientPubkey,
      Array.from(serializedData)
    )
    .accountsPartial({
      caller: authority,
      authMethod: authMethodPda,
      credential: credentialPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { signature, credentialPda };
}

// Helper function to get credential PDA
export function getCredentialPda(
  program: Program<Dawn>,
  authMethod: PublicKey,
  client: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("credential"),
      authMethod.toBuffer(),
      client.toBuffer(),
    ],
    program.programId
  );
}

/**
 * Validate PSK parameters
 */
export function validatePSKMethodParams(params: PSKMethodParams): void {
  // Validate security standard
  if (params.securityStandard > WIFI_SECURITY_STANDARD.WPA3_PSK) {
    throw new Error("Invalid security standard");
  }

  // Validate encryption algorithm
  if (params.encryptionAlgorithm > WIFI_ENCRYPTION.AES_GCMP_256) {
    throw new Error("Invalid encryption algorithm");
  }

  // Validate PSK rotation interval
  if (params.pskRotationInterval !== 0 && 
      (params.pskRotationInterval < 3600 || params.pskRotationInterval > 604800)) {
    throw new Error("Invalid rotation interval");
  }
}

/**
 * Generate PSK credential data for off-chain storage (LEGACY - for tests)
 * @deprecated Use createPskCredentialData and serializePskCredentialData instead
 */
export function generatePskCredential(
  ssid: string,
  psk: string,
  clientPubkey: PublicKey
): Buffer {
  // Create credential with hash using client pubkey as salt
  const credentialData = createPskCredentialData(psk, clientPubkey);
  return serializePskCredentialData(credentialData);
} 