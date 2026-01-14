use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Config PDA - stores protocol parameters
/// seeds = [b"config"]
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// The authority that can update the config
    pub authority: Pubkey,
    /// The SPL token mint used for staking (immutable after init)
    pub stake_mint: Pubkey,
    /// Grace period after end_slot before round can be closed (in slots)
    pub round_close_grace_slots: u64,
    /// Required stake for provers (in token amount)
    pub prover_stake_amount: u64,
    /// Required stake for challengers (in token amount)
    pub challenger_stake_amount: u64,
    /// Cooldown period for unstaking (in slots)
    pub unstake_cooldown_slots: u64,
    /// PDA bump seed
    pub bump: u8,
}

impl Config {
    pub const SEED_PREFIX: &'static [u8] = b"config";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
