use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// The access domain account, representing an access domain tied to a device
#[account]
#[derive(InitSpace)]
pub struct AccessDomain {
    /// The creation timestamp
    pub created_at: i64,
    /// The owner of the access domain, same as the L3 device owner
    pub owner: Pubkey,
    /// Associated local domain
    pub local_domain: Pubkey,
    /// PDA bump seed
    pub bump: u8,
}

impl AccessDomain {
    pub const SEED_PREFIX: &'static [u8] = b"access_domain";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
