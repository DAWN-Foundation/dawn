use anchor_lang::prelude::Pubkey;

mod swap;

pub use swap::*;

// Helper function to convert Option<Pubkey> into a deterministic seed
pub fn optional_seed(optional_pubkey: Option<Pubkey>) -> [u8; 32] {
    match optional_pubkey {
        Some(pubkey) => pubkey.as_ref().try_into().expect("pubkey is not 32 bytes"),
        None => [0; 32],
    }
}
