use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

#[derive(InitSpace)]
/// Account structure for client credentials
#[account]

pub struct Credential {
    /// The creation timestamp
    pub created_at: i64,
    /// The auth method this credential is for
    pub auth_method: Pubkey,
    /// The client public key
    pub client: Pubkey,
    /// Credential-specific data (fixed size buffer)
    pub credential_data: [u8; 128],
    /// PDA bump
    pub bump: u8,
}

impl Credential {
    pub const SEED_PREFIX: &'static [u8] = b"credential";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
