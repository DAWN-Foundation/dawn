use anchor_lang::prelude::Pubkey;

mod swap;

pub use swap::*;

// Helper function to convert Option<Pubkey> into a deterministic seed
pub fn optional_pubkey_seed(optional_pubkey: Option<Pubkey>) -> [u8; 32] {
    match optional_pubkey {
        Some(pubkey) => pubkey.as_ref().try_into().expect("pubkey is not 32 bytes"),
        None => [0; 32],
    }
}

// Helper function to convert Option<i64> into a deterministic seed
pub fn optional_i64_seed(optional_i64: Option<i64>) -> [u8; 8] {
    match optional_i64 {
        Some(i64) => i64.to_le_bytes(),
        None => [0; 8],
    }
}
