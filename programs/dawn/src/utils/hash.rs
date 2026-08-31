use anchor_lang::solana_program::pubkey::MAX_SEED_LEN;
use solana_program::hash::hash;
use std::cmp::min;

/// Hash a String for use in PDA seeds
/// Hashes the input string (after trimming) to produce a deterministic 32-byte seed
pub fn hash_string_seed(input: &str) -> [u8; 32] {
    let trimmed = input.trim();
    let hash_result = hash(trimmed.as_bytes());
    hash_result.to_bytes()
}

/// Hash the full 256-byte parameter array to a 32-byte seed for AuthMethod PDAs
/// This ensures all parameters are considered, not just the first 32 bytes
pub fn hash_parameters(parameters: &[u8; 256]) -> [u8; 32] {
    hash(parameters).to_bytes()
}

/// Legacy function - DEPRECATED, use hash_string_seed instead
#[deprecated(note = "Use hash_string_seed instead for hashed seeds")]
#[allow(dead_code)]
pub fn canonicalize_string_seed(input: &str) -> &[u8] {
    let trimmed = input.trim();
    let bytes = trimmed.as_bytes();
    &bytes[..min(bytes.len(), MAX_SEED_LEN)]
}
