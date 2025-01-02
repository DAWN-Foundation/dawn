use anchor_lang::prelude::Pubkey;

mod swap;

pub use swap::*;

// Helper function to convert Option<Pubkey> into a deterministic seed
pub fn optional_seed(optional_pubkey: Option<Pubkey>) -> Vec<u8> {
    match optional_pubkey {
        Some(pubkey) => pubkey.as_ref().to_vec(),
        None => Pubkey::default().as_ref().to_vec(),
    }
}
