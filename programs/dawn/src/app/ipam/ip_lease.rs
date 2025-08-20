use crate::Tier;
use anchor_lang::prelude::*;

/// Minimal IP Lease for IPAM strict-first allocation
/// Represents a single IP address lease to a device
#[account]
pub struct IpLease {
    /// Tier identifier (Subscriber, Loopback, PtP)
    pub tier: Tier,
    /// Device this IP is leased to
    pub device: Pubkey,
    /// IPv4 address (32-bit)
    pub ipv4: [u8; 4],
    /// Prefix length (/32 or /31)
    pub ip_v4_cidr_mask: u8,
    /// block index in root
    pub block_index: u32,
    /// ip index in block
    pub unit_index: u32,
    /// Lease expiration time (UNIX timestamp)
    pub lease_end: i64,
    /// PDA bump seed
    pub bump: u8,
}

/// Calculate account size for IpLease
pub const IP_LEASE_SIZE: usize = 8 // discriminator
    + 1 // tier (stored as u8)
    + 32 // device
    + 4 // ipv4
    + 1 // prefix
    + 4 // block_index
    + 4 // unit_index
    + 8 // lease_end
    + 1; // bump

impl IpLease {
    /// Initialize a new IP lease
    pub fn initialize(
        &mut self,
        tier: Tier,
        device: Pubkey,
        ipv4: [u8; 4],
        cidr: u8,
        block_index: u32,
        unit_index: u32,
        lease_end: i64,
        bump: u8,
    ) {
        self.tier = tier;
        self.device = device;
        self.ipv4 = ipv4;
        self.ip_v4_cidr_mask = cidr;
        self.block_index = block_index;
        self.unit_index = unit_index;
        self.lease_end = lease_end;
        self.bump = bump;
    }

    /// Check if the lease has expired
    pub fn is_expired(&self) -> bool {
        Clock::get().unwrap().unix_timestamp > self.lease_end
    }
}
