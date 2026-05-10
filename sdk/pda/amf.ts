import { PublicKey } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'
import { Dawn } from '../../target/types/dawn'
import { AuthMethodType } from '../utils/helpers'
import { createHash } from 'crypto'

const methods = {
  psk: 0,
  mpsk: 1,
  wpa2Enterprise: 2,
  eap: 3,
  ipsecAh: 4,
  wpa3Enterprise: 5,
}

/**
 * Hash the full 256-byte parameter array to a 32-byte seed
 * This matches the Rust implementation: hash(parameters).to_bytes()
 */
export function hashParameters(parameters: Buffer): Buffer {
  if (parameters.length !== 256) {
    throw new Error(
      `Parameters must be exactly 256 bytes, got ${parameters.length}`,
    )
  }
  return createHash('sha256').update(parameters).digest()
}

/**
 * AuthMethod PDA — keyed on (access_domain, method_type_byte).
 *
 * Schema migration: prior versions seeded on
 * (authority, method_type, device, encryption_key, hash(parameters)).
 * The redesign collapses to one AuthMethod per (AccessDomain,
 * method_type) and makes parameters mutable in place via
 * update_auth_method_params.
 */
export function getAuthMethodPda(
  program: Program<Dawn>,
  accessDomain: PublicKey,
  methodType: AuthMethodType,
): PublicKey {
  const key = Object.keys(methodType)[0]
  const seed = methods[key]

  const [authMethodPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('auth_method'), accessDomain.toBuffer(), Buffer.from([seed])],
    program.programId,
  )

  return authMethodPda
}

/**
 * Get the PDA for a client credential account
 * @param program The Dawn program
 * @param clientPubkey The client public key
 * @param methodType The method type number
 * @returns The credential PDA
 */
/**
 * Credential PDA — keyed on (access_domain, auth_method, beneficiary).
 *
 * Schema migration: subscription and plan are no longer in the seeds.
 * They're stored as Optional fields on the Credential when the
 * plan-attached path is used; for the BSS-direct path both are None.
 */
export function getCredentialPda(
  program: Program<Dawn>,
  accessDomain: PublicKey,
  authMethod: PublicKey,
  beneficiary: PublicKey,
): PublicKey {
  const [credentialPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('credential'),
      accessDomain.toBuffer(),
      authMethod.toBuffer(),
      beneficiary.toBuffer(),
    ],
    program.programId,
  )

  return credentialPda
}

export function getConnectionPda(
  program: Program<Dawn>,
  authMethod: PublicKey,
  entityA: PublicKey,
  entityB: PublicKey,
): PublicKey {
  const [connectionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('connection'),
      authMethod.toBuffer(),
      entityA.toBuffer(),
      entityB.toBuffer(),
    ],
    program.programId,
  )

  return connectionPda
}

/**
 * Get the PDA for a PSK auth method on an AccessDomain.
 *
 * Schema migration: see getAuthMethodPda above. PSK uses method_type
 * byte 0; Mpsk uses byte 1.
 */
export function getPskAuthMethodPda(
  program: Program<Dawn>,
  accessDomain: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('auth_method'),
      accessDomain.toBuffer(),
      Buffer.from([0]), // PSK method type seed
    ],
    program.programId,
  )
}
