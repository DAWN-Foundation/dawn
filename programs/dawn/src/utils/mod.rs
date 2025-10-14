use anchor_lang::{prelude::Pubkey, solana_program::pubkey::MAX_SEED_LEN};

use std::cmp::min;

mod da_proof;
mod swap;

pub use da_proof::*;
pub use swap::*;

// Helper function to convert Option<Pubkey> into a deterministic seed
pub fn optional_pubkey_seed(optional_pubkey: Option<Pubkey>) -> [u8; 32] {
    match optional_pubkey {
        Some(pubkey) => pubkey.as_ref().try_into().expect("pubkey is not 32 bytes"),
        None => [0; 32],
    }
}

// Helper function to convert Option<i64> into a deterministic seed
pub fn _optional_i64_seed(optional_i64: Option<i64>) -> [u8; 8] {
    match optional_i64 {
        Some(i64) => i64.to_le_bytes(),
        None => [0; 8],
    }
}

// Helper function to trim null bytes from a fixed-size byte array for seeds
pub fn trim_null_bytes(bytes: &[u8]) -> &[u8] {
    // Find the first null byte, or use the full length if no null bytes
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    // Return the slice up to the first null byte, with a maximum of MAX_SEED_LEN for seed constraints
    &bytes[..min(end, MAX_SEED_LEN)]
}
