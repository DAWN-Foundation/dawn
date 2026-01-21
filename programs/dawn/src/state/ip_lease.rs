use crate::IpTier;
use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Minimal IP Lease for IPAM strict-first allocation
/// Represents a single IP address lease to a device or subscription
#[account]
#[derive(InitSpace)]
pub struct IpLease {
    /// The creation timestamp
    pub created_at: i64,
    /// Tier identifier (Subscriber, Loopback, PtP)
    pub tier: IpTier,
    /// Key used for PDA derivation (subscription.key() for Subscriber tier, device.key() for others)
    pub seed_key: Pubkey,
    /// Device this IP is leased to (optional for mobile subscribers, required for Loopback/PtP)
    pub device: Option<Pubkey>,
    /// IPv4 address (32-bit)
    pub ipv4: [u8; 4],
    /// Prefix length (/32 or /31)
    pub ip_v4_cidr_mask: u8,
    /// block index in root
    pub block_index: u32,
    /// ip index in block
    pub unit_index: u32,
    /// PDA bump seed
    pub bump: u8,
}

impl IpLease {
    pub const SEED_PREFIX: &'static [u8] = b"ip_lease";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;

    /// Initialize a new IP lease
    pub fn initialize(
        &mut self,
        tier: IpTier,
        seed_key: Pubkey,
        device: Option<Pubkey>,
        ipv4: [u8; 4],
        cidr: u8,
        block_index: u32,
        unit_index: u32,
        bump: u8,
    ) -> Result<()> {
        self.created_at = Clock::get()?.unix_timestamp;
        self.tier = tier;
        self.seed_key = seed_key;
        self.device = device;
        self.ipv4 = ipv4;
        self.ip_v4_cidr_mask = cidr;
        self.block_index = block_index;
        self.unit_index = unit_index;
        self.bump = bump;
        Ok(())
    }
}
