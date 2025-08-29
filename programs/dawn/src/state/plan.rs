use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// The plan account, representing a subscription plan tied to a device
#[account]
#[derive(InitSpace)]
pub struct Plan {
    /// The creation timestamp
    pub created_at: i64,
    /// The plan owner
    pub owner: Pubkey,
    /// Associated Access Domain
    pub access_domain: Option<Pubkey>,
    /// Associated Distribution Domain
    pub distribution_domain: Option<Pubkey>,
    /// Associated Local Domain
    pub local_domain: Pubkey,
    /// The parent plan (for resale)
    pub parent_plan: Option<Pubkey>,
    /// The plan name (arbitrary string up to 32 bytes)
    #[max_len(32)]
    pub name: String,
    /// The plan price per `duration` days (in USDC with 6 decimals)
    pub price: u64,
    /// The plan duration in days
    pub duration: u16,
    /// The plan provided speed in Mbps (megabits per second)
    pub speed: u32,
    /// The plan provided data capacity in MB (megabytes)
    /// per `duration` days, 0 for unlimited
    pub capacity: u64,
    /// The start time of the plan (0 for immediate start)
    pub start_at: i64,
    /// The Service Level Agreement Account
    pub service_agreement: Pubkey,
    /// The authentication methods for the plan (max 2)
    #[max_len(2)]
    pub auth_methods: Vec<Pubkey>,
    /// PDA bump seed
    pub bump: u8,
}

impl Plan {
    pub const SEED_PREFIX: &'static [u8] = b"plan";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
