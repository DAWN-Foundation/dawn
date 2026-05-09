use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Protocol singleton — the only off-chain-administered piece of state
/// in the access-domain build. Holds the cold-admin authority that
/// controls global gates such as `add_device_model`.
///
/// Initialized once with `initialize_config(authority)`. Subsequent
/// updates (rotating the authority) go through `update_config_authority`,
/// signed by the current authority.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Creation timestamp.
    pub created_at: i64,
    /// The cold-admin authority. Required signer for protocol-wide
    /// operations (currently: registering DeviceModels). Each AccessDomain
    /// has its own owner; this is separate.
    pub authority: Pubkey,
    /// PDA bump seed.
    pub bump: u8,
}

impl Config {
    pub const SEED_PREFIX: &'static [u8] = b"config";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
