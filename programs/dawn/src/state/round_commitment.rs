use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// RoundCommitment PDA (per round)
/// seeds = [b"round", seed]
#[account]
#[derive(InitSpace)]
pub struct RoundCommitment {
    /// Random seed derived from a recent blockhash / VRF output
    pub seed: [u8; 32],
    /// Expected minimum = 1/(N+1) stored as fixed-point (scale 1e12)
    pub expected_min_scaled: u128,
    /// Packets per round
    pub n_packets: u32, // N
    /// Rounds per session
    pub n_rounds: u16,  // R
    /// Slot window for submissions
    pub start_slot: u64,
    pub end_slot: u64,
    /// Data Anchor root for this round namespace
    pub data_anchor_root: [u8; 32],
    /// PDA bump seed
    pub bump: u8,
}

impl RoundCommitment {
    pub const SEED_PREFIX: &'static [u8] = b"round";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}

