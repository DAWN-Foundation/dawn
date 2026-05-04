import { PublicKey } from '@solana/web3.js'

/**
 * Minimal SPL Token / Mint decoders. The codec proper only handles dawn
 * account types (recognized by Anchor's 8-byte discriminator). SPL
 * accounts have a different, fixed-layout encoding and use the SPL Token
 * program's own format. WorldState needs to read token balances and
 * mint supplies for the `dawn-supply-conserved` invariant and for the
 * `tokenBalance` / `totalSupply` API.
 *
 * SPL Token Account layout (165 bytes, Token v3 — token::state::Account):
 *   0..32     mint (Pubkey)
 *   32..64    owner (Pubkey)
 *   64..72    amount (u64 LE)
 *   72..76    delegate option flag (u32; 0=None, 1=Some)
 *   76..108   delegate (Pubkey, valid only if flag==1)
 *   108..109  state (u8: 0=Uninit, 1=Init, 2=Frozen)
 *   109..113  is_native option flag
 *   113..121  is_native value (u64; rent-exempt reserve when native)
 *   121..129  delegated_amount (u64)
 *   129..133  close_authority option flag
 *   133..165  close_authority (Pubkey)
 *
 * SPL Mint layout (82 bytes — token::state::Mint):
 *   0..4      mint_authority option flag (u32)
 *   4..36     mint_authority (Pubkey)
 *   36..44    supply (u64)
 *   44..45    decimals (u8)
 *   45..46    is_initialized (u8: bool)
 *   46..50    freeze_authority option flag
 *   50..82    freeze_authority (Pubkey)
 *
 * We only decode the fields invariants need; padding fields are ignored.
 */

export const SPL_TOKEN_ACCOUNT_LEN = 165
export const SPL_MINT_LEN = 82

export interface SplTokenAccount {
  mint: PublicKey
  owner: PublicKey
  amount: bigint
  state: number
}

export function decodeSplTokenAccount(data: Buffer): SplTokenAccount | null {
  if (data.length !== SPL_TOKEN_ACCOUNT_LEN) return null
  return {
    mint: new PublicKey(data.subarray(0, 32)),
    owner: new PublicKey(data.subarray(32, 64)),
    amount: data.readBigUInt64LE(64),
    state: data.readUInt8(108),
  }
}

export interface SplMint {
  mintAuthority: PublicKey | null
  supply: bigint
  decimals: number
  isInitialized: boolean
  freezeAuthority: PublicKey | null
}

export function decodeSplMint(data: Buffer): SplMint | null {
  if (data.length !== SPL_MINT_LEN) return null
  const authFlag = data.readUInt32LE(0)
  const mintAuthority =
    authFlag === 1 ? new PublicKey(data.subarray(4, 36)) : null
  const supply = data.readBigUInt64LE(36)
  const decimals = data.readUInt8(44)
  const isInitialized = data.readUInt8(45) !== 0
  const freezeFlag = data.readUInt32LE(46)
  const freezeAuthority =
    freezeFlag === 1 ? new PublicKey(data.subarray(50, 82)) : null
  return {
    mintAuthority,
    supply,
    decimals,
    isInitialized,
    freezeAuthority,
  }
}
