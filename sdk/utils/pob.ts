import { PublicKey } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import * as crypto from 'crypto'

/**
 * Data Anchor Program ID (also known as Blober Program ID)
 * Uses the test Blober program ID from mock.ts
 */
export const DA_PROGRAM_ID = new PublicKey(
  'anchorE4RzhiFx3TEFep6yRNK9igZBzMVWziqjbGHp2',
)

/**
 * SessionLeaf interface matching the Rust struct
 * Used for creating Merkle leaves in the PoB protocol
 */
export interface SessionLeaf {
  challenger: PublicKey
  prover: PublicKey
  roundId: bigint
  packetRoot: Uint8Array
  n: number
}

/**
 * Domain separation constants for hashing (must match Rust implementation)
 */
const DOMAIN_LEAF = Buffer.from('DA-LEAF:v1')
const DOMAIN_COMBINE = Buffer.from('DA-MERKLE:v1')

/**
 * Creates a SessionLeaf object from the given parameters
 * @param challenger - The challenger's public key
 * @param prover - The prover's public key (PDA)
 * @param roundId - The round identifier (u64)
 * @param nPackets - Number of packets in the session
 * @returns SessionLeaf object
 */
export function createSessionLeaf(
  challenger: PublicKey,
  prover: PublicKey,
  roundId: bigint,
  nPackets: number,
): SessionLeaf {
  // Create a deterministic packet root based on the inputs
  // In production, this would be the actual root of the packet Merkle tree
  const packetRoot = crypto
    .createHash('sha256')
    .update(challenger.toBuffer())
    .update(prover.toBuffer())
    .update(Buffer.from(roundId.toString()))
    .update(Buffer.from(nPackets.toString()))
    .digest()

  return {
    challenger,
    prover,
    roundId,
    packetRoot,
    n: nPackets,
  }
}

/**
 * Computes the hash of a SessionLeaf (must match Rust implementation)
 * @param leaf - The SessionLeaf to hash
 * @returns 32-byte hash
 */
export function computeLeafHash(leaf: SessionLeaf): Buffer {
  // Serialize the leaf data in the same order as Rust:
  // challenger (32) + prover (32) + round_id (8) + packet_root (32) + n (4)
  const buf = Buffer.alloc(32 + 32 + 8 + 32 + 4)
  let offset = 0

  // challenger
  leaf.challenger.toBuffer().copy(buf, offset)
  offset += 32

  // prover
  leaf.prover.toBuffer().copy(buf, offset)
  offset += 32

  // round_id (u64 little-endian)
  buf.writeBigUInt64LE(leaf.roundId, offset)
  offset += 8

  // packet_root
  Buffer.from(leaf.packetRoot).copy(buf, offset)
  offset += 32

  // n (u32 little-endian)
  buf.writeUInt32LE(leaf.n, offset)

  // Domain-separated hash using Solana's hashv
  return hashv([DOMAIN_LEAF, buf])
}

/**
 * Solana hashv implementation (keccak256 of concatenated inputs)
 * @param inputs - Array of buffers to hash
 * @returns 32-byte hash
 */
function hashv(inputs: Buffer[]): Buffer {
  const hash = crypto.createHash('sha256')
  for (const input of inputs) {
    hash.update(input)
  }
  return hash.digest()
}

/**
 * Combines two hashes using ordered (lexicographic) hashing
 * Must match the Rust combine_ordered function
 * @param a - First hash
 * @param b - Second hash
 * @returns Combined hash
 */
function combineOrdered(a: Buffer, b: Buffer): Buffer {
  // Sort lexicographically
  const [lo, hi] = a.compare(b) <= 0 ? [a, b] : [b, a]
  return hashv([DOMAIN_COMBINE, lo, hi])
}

/**
 * Builds a Merkle proof and computes the root
 * @param leafHash - The leaf hash to prove
 * @param siblings - Array of sibling hashes
 * @returns Object containing root and proof structure
 */
export function buildMerkleProof(
  leafHash: Buffer,
  siblings: Buffer[],
): { root: Buffer; proof: { siblings: number[][] } } {
  let current = leafHash

  // Compute root by combining with siblings
  for (const sibling of siblings) {
    current = combineOrdered(current, sibling)
  }

  // Convert siblings to the format expected by the Anchor program
  const proof = {
    siblings: siblings.map((s) => Array.from(s)),
  }

  return { root: current, proof }
}

/**
 * Gets the current slot from the provider
 * @param provider - BankrunProvider instance
 * @returns Current slot number
 */
export async function getCurrentSlot(
  provider: BankrunProvider,
): Promise<number> {
  const slot = await provider.context.banksClient.getSlot()
  return Number(slot)
}

/**
 * Warps the blockchain to a specific slot
 * @param provider - BankrunProvider instance
 * @param slot - Target slot number
 */
export async function warpToSlot(
  provider: BankrunProvider,
  slot: number,
): Promise<void> {
  provider.context.warpToSlot(BigInt(slot))
}

/**
 * Generates a random 32-byte seed for challenge rounds
 * @returns Random 32-byte buffer
 */
export function generateRandomSeed(): Buffer {
  return crypto.randomBytes(32)
}

/**
 * Generates a random 32-byte min token
 * @returns Random 32-byte buffer
 */
export function generateRandomMinToken(): Buffer {
  return crypto.randomBytes(32)
}

/**
 * Finds the Blober PDA for Data Anchor
 * Based on data-anchor-blober v0.2.2 implementation
 * @param authority - The authority/payer public key (not used in PDA derivation, kept for API compatibility)
 * @param namespace - The namespace string
 * @returns Blober PDA
 */
export function findBloberPda(
  authority: PublicKey,
  namespace: string,
): PublicKey {
  // data-anchor-blober derives the blober PDA using just the namespace as the seed
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(namespace, 'utf8')],
    DA_PROGRAM_ID,
  )
  return pda
}

/**
 * Finds the Blob PDA for Data Anchor
 * Based on data-anchor-blober v0.2.2 DeclareBlob seeds
 * @param bloberPda - The blober PDA
 * @param payer - The payer public key
 * @param timestamp - Unix timestamp (u64)
 * @param blobSize - Size of the blob in bytes (u32)
 * @returns Blob PDA
 */
export function findBlobPda(
  bloberPda: PublicKey,
  payer: PublicKey,
  timestamp: number,
  blobSize: number,
): PublicKey {
  const timestampBuffer = Buffer.alloc(8)
  timestampBuffer.writeBigUInt64LE(BigInt(timestamp))

  // Note: blob_size is u32, not u64
  const sizeBuffer = Buffer.alloc(4)
  sizeBuffer.writeUInt32LE(blobSize)

  // Seeds: [SEED="blobs", payer, blober, timestamp(u64), blob_size(u32)]
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('blobs'), // Note: plural "blobs", not "blob"
      payer.toBuffer(),
      bloberPda.toBuffer(),
      timestampBuffer,
      sizeBuffer,
    ],
    DA_PROGRAM_ID,
  )
  return pda
}
