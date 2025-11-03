use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// The local domain account
#[account]
#[derive(InitSpace)]
pub struct LocalDomain {
    /// The creation timestamp
    pub created_at: i64,
    // Name of the local domain converted to a fixed-size byte array
    #[max_len(32)]
    pub name: String,
    /// The owner of the local domain
    pub owner: Pubkey,
    /// PDA bump seed
    pub bump: u8,
}

impl LocalDomain {
    pub const SEED_PREFIX: &'static [u8] = b"local_domain";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
