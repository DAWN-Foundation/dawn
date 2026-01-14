use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Prover PDA
/// seeds = [b"prover", authority]
#[account]
#[derive(InitSpace)]
pub struct Prover {
    /// The authority who controls this prover
    pub authority: Pubkey,
    /// Slot when the prover was created
    pub created_at_slot: u64,
    /// Stake amount in tokens
    pub stake_amount: u64,
    /// Slot when unstake was requested (0 if not requested)
    pub unstake_requested_slot: u64,
    /// Reputation score
    pub reputation: u32,
    /// PDA bump seed
    pub bump: u8,
}

impl Prover {
    pub const SEED_PREFIX: &'static [u8] = b"prover";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
