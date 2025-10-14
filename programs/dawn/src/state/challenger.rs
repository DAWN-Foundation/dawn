use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Challenger PDA
/// seeds = [b"challenger", authority]
#[account]
#[derive(InitSpace)]
pub struct Challenger {
    /// The authority who controls this challenger
    pub authority: Pubkey,
    /// Slot when the challenger was created
    pub created_at_slot: u64,
    /// Stake amount in lamports
    pub stake_lamports: u64,
    /// Reputation score
    pub reputation: u32,
    /// PDA bump seed
    pub bump: u8,
}

impl Challenger {
    pub const SEED_PREFIX: &'static [u8] = b"challenger";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}

