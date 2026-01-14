use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Aggregator PDA (accumulates min-hash observations), one per (round, prover)
/// seeds = [b"agg", round_pubkey, prover]
#[account]
#[derive(InitSpace)]
pub struct Aggregator {
    /// Round this aggregator belongs to
    pub round: Pubkey,
    /// Prover this aggregator belongs to
    pub prover: Pubkey,
    /// Online stats across all submissions
    pub num_submissions: u32, // across challengers * rounds
    /// Σ((1-m)/m) scaled
    pub sum_n_est_scaled: u128,
    /// Whether this aggregator has been finalized
    pub finalized: bool,
    /// Finalized p_hat scaled
    pub finalized_p_hat_scaled: u128,
    /// Version to prevent replay against stale pointers
    pub version: u32,
    /// PDA bump seed
    pub bump: u8,
}

impl Aggregator {
    pub const SEED_PREFIX: &'static [u8] = b"aggregator";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
