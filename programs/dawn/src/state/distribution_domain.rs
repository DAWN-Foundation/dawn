use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// The distribution domain account, representing a distribution domain tied to a device
#[account]
#[derive(InitSpace)]
pub struct DistributionDomain {
    /// The creation timestamp
    pub created_at: i64,
    /// The owner of the distribution domain, same as the L3 device owner
    pub owner: Pubkey,
    /// Associated local domain
    pub local_domain: Pubkey,
    /// PDA bump seed
    pub bump: u8,
}

impl DistributionDomain {
    pub const SEED_PREFIX: &'static [u8] = b"distribution_domain";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
