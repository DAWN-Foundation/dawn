use anchor_lang::prelude::*;

/// The local domain account
#[account]
pub struct LocalDomain {
    /// The creation timestamp
    pub created_at: i64,
    // Name of the local domain converted to a fixed-size byte array
    pub name: [u8; 32],
    /// The owner of the local domain
    pub owner: Pubkey,
    /// PDA bump seed
    pub bump: u8,
}

pub const LOCAL_DOMAIN_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // name
    + 32 // owner
    + 1; // bump
