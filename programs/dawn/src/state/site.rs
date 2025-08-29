use anchor_lang::prelude::*;

use crate::constants::{DISCRIMINATOR_SIZE, MAX_SITE_NAME_LEN};

/// The site account, representing a site
#[account]
#[derive(InitSpace)]
pub struct Site {
    /// The creation timestamp
    pub created_at: i64,
    /// The owner's public key who registered this site
    pub owner: Pubkey,
    /// The site name
    #[max_len(MAX_SITE_NAME_LEN)]
    pub name: String,
    /// PDA bump seed
    pub bump: u8,
}

impl Site {
    pub const SEED_PREFIX: &'static [u8] = b"site";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
