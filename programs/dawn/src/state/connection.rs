use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Account structure for connection between two entities
#[account]
#[derive(InitSpace)]
pub struct Connection {
    /// The creation timestamp
    pub created_at: i64,
    /// The auth method this connection uses
    pub auth_method: Pubkey,
    /// Entity A public key (typically initiator)
    pub entity_a: Pubkey,
    /// Entity B public key (typically responder)
    pub entity_b: Pubkey,
    /// Entity A credential data (fixed size buffer)
    pub credential_data_a: [u8; 64],
    /// Entity B credential data (fixed size buffer)
    pub credential_data_b: [u8; 64],
    /// PDA bump
    pub bump: u8,
}

impl Connection {
    pub const SEED_PREFIX: &'static [u8] = b"connection";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
