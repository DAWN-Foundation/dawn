use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Receipt PDA - prevents replay of same min_token for (round, prover)
/// seeds = [b"receipt", round, prover, min_token]
#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub round: Pubkey,
    pub prover: Pubkey,
    pub min_token: [u8; 32],
    pub submitted_at_slot: u64,
    pub bump: u8,
}

impl Receipt {
    pub const SEED_PREFIX: &'static [u8] = b"receipt";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
