use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// The service agreement account
#[account]
#[derive(InitSpace)]
pub struct ServiceAgreement {
    /// The creation timestamp
    pub created_at: i64,
    /// The percentage threshold for the service agreement
    pub threshold: u64,
    /// The payout ratio for the service agreement
    pub payout_ratio: u64,
    /// PDA bump seed
    pub bump: u8,
}

impl ServiceAgreement {
    pub const SEED_PREFIX: &'static [u8] = b"service_agreement";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
