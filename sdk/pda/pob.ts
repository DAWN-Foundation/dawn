import { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { Pob } from '../../target/types/pob'

/**
 * Get PoB Config PDA
 * seeds = [b"config"]
 */
export function getPobConfigPda(program: Program<Pob>): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )
}

/**
 * Get Prover PDA
 * seeds = [b"prover", authority]
 */
export function getProverPda(
  program: Program<Pob>,
  authority: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('prover'), authority.toBuffer()],
    program.programId,
  )
}

/**
 * Get Challenger PDA
 * seeds = [b"challenger", authority]
 */
export function getChallengerPda(
  program: Program<Pob>,
  authority: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('challenger'), authority.toBuffer()],
    program.programId,
  )
}

/**
 * Get RoundCommitment PDA
 * seeds = [b"round", seed]
 */
export function getRoundCommitmentPda(
  program: Program<Pob>,
  seed: Uint8Array | Buffer,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('round'), Buffer.from(seed)],
    program.programId,
  )
}

/**
 * Get Aggregator PDA
 * seeds = [b"aggregator", round, prover]
 */
export function getAggregatorPda(
  program: Program<Pob>,
  round: PublicKey,
  prover: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('aggregator'), round.toBuffer(), prover.toBuffer()],
    program.programId,
  )
}

/**
 * Get Receipt PDA
 * seeds = [b"receipt", round, prover, min_token]
 */
export function getReceiptPda(
  program: Program<Pob>,
  round: PublicKey,
  prover: PublicKey,
  minToken: Uint8Array | Buffer,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('receipt'),
      round.toBuffer(),
      prover.toBuffer(),
      Buffer.from(minToken),
    ],
    program.programId,
  )
}

/**
 * Get ProverVault PDA (now a token account)
 * seeds = [b"prover_vault", prover]
 */
export function getProverVaultPda(
  program: Program<Pob>,
  prover: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('prover_vault'), prover.toBuffer()],
    program.programId,
  )
}

/**
 * Get ChallengerVault PDA (now a token account)
 * seeds = [b"challenger_vault", challenger]
 */
export function getChallengerVaultPda(
  program: Program<Pob>,
  challenger: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('challenger_vault'), challenger.toBuffer()],
    program.programId,
  )
}

/**
 * Get the Associated Token Account (ATA) for a given owner and mint.
 * Used for user token accounts when staking/unstaking.
 */
export function getStakeTokenAta(
  owner: PublicKey,
  mint: PublicKey,
): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner)
}
