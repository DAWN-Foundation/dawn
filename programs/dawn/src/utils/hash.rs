use anchor_lang::{
    solana_program::{hash::hash, pubkey::MAX_SEED_LEN},
    Result,
};
use std::cmp::min;

use crate::DawnError;

/// Hash a String for use in PDA seeds
/// Hashes the input string (after trimming) to produce a deterministic 32-byte seed
pub fn hash_string_seed(input: &str) -> [u8; 32] {
    let trimmed = input.trim();
    let hash_result = hash(trimmed.as_bytes());
    hash_result.to_bytes()
}

/// Hash a fixed-size byte array for use in PDA seeds
/// Used for fields stored as [u8; 32] in account state (like LocalDomain.name)
/// 1. Finds first null byte (0x00) or end of array
/// 2. Converts valid UTF-8 slice to &str
/// 3. Trims whitespace
/// 4. Hashes the trimmed bytes
pub fn hash_bytes_seed(bytes: &[u8]) -> Result<[u8; 32]> {
    // Find the first null byte, or use full length
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());

    // Take slice up to null byte
    let valid_bytes = &bytes[..end];

    // Convert to UTF-8 string (validation)
    let s = std::str::from_utf8(valid_bytes).map_err(|_| DawnError::InvalidUtf8InSeed)?;

    // Trim whitespace and hash
    let trimmed = s.trim();
    let hash_result = hash(trimmed.as_bytes());
    Ok(hash_result.to_bytes())
}

/// Legacy function - DEPRECATED, use hash_string_seed instead
#[deprecated(note = "Use hash_string_seed instead for hashed seeds")]
#[allow(dead_code)]
pub fn canonicalize_string_seed(input: &str) -> &[u8] {
    let trimmed = input.trim();
    let bytes = trimmed.as_bytes();
    &bytes[..min(bytes.len(), MAX_SEED_LEN)]
}
