import { PublicKey } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'
import { Dawn } from '../../target/types/dawn'
import { AuthMethodType } from '../utils/helpers'

const methods = {
  psk: 0,
  mpsk: 1,
  wpa2Enterprise: 2,
  eap: 3,
  ipsecAh: 4,
  wpa3Enterprise: 5,
}

export function getAuthMethodPda(
  program: Program<Dawn>,
  authority: PublicKey,
  methodType: AuthMethodType,
  parameters: Buffer,
): PublicKey {
  const key = Object.keys(methodType)[0]
  const seed = methods[key]

  const [authMethodPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('auth_method'),
      authority.toBuffer(),
      Buffer.from([seed]),
      parameters.slice(0, 32), // MAX_SEED_LEN
    ],
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
export function getCredentialPda(
  program: Program<Dawn>,
  authMethod: PublicKey,
  client: PublicKey,
): PublicKey {
  const [credentialPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('credential'), authMethod.toBuffer(), client.toBuffer()],
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
 * Get the PDA for a PSK authentication method
 */
export function getPskAuthMethodPda(
  program: Program<Dawn>,
  authority: PublicKey,
  parameters: Buffer,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('auth_method'),
      authority.toBuffer(),
      Buffer.from([0]), // PSK method type seed
      parameters.slice(0, 32), // MAX_SEED_LEN
    ],
    program.programId,
  )
}
