import { PublicKey } from '@solana/web3.js'

/**
 * Get the PDA for a connection credential between two entities
 * @param program Anchor program instance
 * @param entityA First entity public key
 * @param entityB Second entity public key
 * @param authMethod Auth method public key
 * @param connectionType Connection type value
 * @returns PDA for the connection credential
 */
export function getConnectionPda(
  program: any,
  entityA: PublicKey,
  entityB: PublicKey,
  authMethod: PublicKey,
  connectionType: number
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('connection'),
      entityA.toBuffer(),
      entityB.toBuffer(),
      authMethod.toBuffer(),
      Buffer.from([connectionType]),
    ],
    program.programId
  )
  return pda
} 