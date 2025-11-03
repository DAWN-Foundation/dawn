use anchor_lang::solana_program::{hash::hash, pubkey::MAX_SEED_LEN};
use std::cmp::min;

/// Hash a String for use in PDA seeds
/// Hashes the input string (after trimming) to produce a deterministic 32-byte seed
pub fn hash_string_seed(input: &str) -> [u8; 32] {
    let trimmed = input.trim();
    let hash_result = hash(trimmed.as_bytes());
    hash_result.to_bytes()
}

/// Legacy function - DEPRECATED, use hash_string_seed instead
#[deprecated(note = "Use hash_string_seed instead for hashed seeds")]
#[allow(dead_code)]
pub fn canonicalize_string_seed(input: &str) -> &[u8] {
    let trimmed = input.trim();
    let bytes = trimmed.as_bytes();
    &bytes[..min(bytes.len(), MAX_SEED_LEN)]
}
