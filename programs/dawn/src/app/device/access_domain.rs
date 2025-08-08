use anchor_lang::prelude::*;

/// The access domain account, representing an access domain tied to a device
#[account]
pub struct AccessDomain {
    /// The creation timestamp
    pub created_at: i64,
    /// The owner of the access domain, same as the L3 device owner
    pub owner: Pubkey,
    /// Associated local domain
    pub local_domain: Pubkey,
    /// PDA bump seed
    pub bump: u8,
}

pub const ACCESS_DOMAIN_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // owner
    + 32 // local_domain
    + 1; // bump
