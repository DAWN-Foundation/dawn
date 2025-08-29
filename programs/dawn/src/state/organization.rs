use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// The type of the organization
#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug, InitSpace, PartialEq, Eq)]
pub enum OrganizationType {
    NumberAuthority,
    Rir,
    Registry,
    EndUser,
}

impl OrganizationType {
    pub fn to_seed(&self) -> &[u8] {
        match self {
            Self::NumberAuthority => &[0],
            Self::Rir => &[1],
            Self::Registry => &[2],
            Self::EndUser => &[3],
        }
    }
}

/// The organization account, representing an organization
#[account]
#[derive(InitSpace)]
pub struct Organization {
    /// The creation timestamp
    pub created_at: i64,
    /// The owner of the organization
    pub owner: Pubkey,
    /// The type of the organization
    pub organization_type: OrganizationType,
    /// The name of the organization
    #[max_len(32)]
    pub name: String,
    /// PDA bump seed
    pub bump: u8,
}

impl Organization {
    pub const SEED_PREFIX: &'static [u8] = b"organization";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
