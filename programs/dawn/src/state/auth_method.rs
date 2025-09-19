use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

use super::AuthMethodType;

/// Account structure for authentication methods
#[account]
#[derive(InitSpace)]
pub struct AuthMethod {
    /// The creation timestamp
    pub created_at: i64,
    /// The authority of the auth method
    pub authority: Pubkey,
    /// Which method this represents (maps to AuthMethodType enum)
    pub method_type: AuthMethodType,
    /// The device that the auth method is associated with
    pub device: Pubkey,
    /// Method-specific parameters (fixed size buffer)
    pub parameters: [u8; 256],
    /// PDA bump
    pub bump: u8,
}

impl AuthMethod {
    pub const SEED_PREFIX: &'static [u8] = b"auth_method";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
