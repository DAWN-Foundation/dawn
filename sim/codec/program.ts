import { PublicKey } from '@solana/web3.js'

/** Localnet/non-devnet DAWN program ID (matches programs/dawn/src/lib.rs declare_id). */
export const DAWN_PROGRAM_ID = new PublicKey(
  '4yBWXvJ2otyMvkBewgKhnkJ7WP1c7HHDSicdQwH4dXqC',
)

/** Raydium CPMM (CP-Swap) program. Loaded as a fixture in bankrun. */
export const RAYDIUM_PROGRAM_ID = new PublicKey(
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
)

/** Metaplex Token Metadata program. Loaded as a fixture in bankrun. */
export const METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
)

/** SPL Token program (built into bankrun). */
export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
)

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
)

export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111')

export const SYSVAR_RENT_PUBKEY = new PublicKey(
  'SysvarRent111111111111111111111111111111111',
)
