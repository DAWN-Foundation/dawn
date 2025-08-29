use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// The device account, representing a device
#[account]
#[derive(InitSpace)]
pub struct Device {
    /// The creation timestamp
    pub created_at: i64,
    /// The owner's public key who registered this device
    pub owner: Pubkey,
    /// Reference to the Site account
    pub site: Option<Pubkey>,
    /// Reference to the DeviceModel account
    pub model: Pubkey,
    /// Reference to the Organization account
    pub organization: Pubkey,
    /// Optional reference to the IpLease account
    pub infra_ip: Option<Pubkey>,
    /// Name of the device
    #[max_len(32)]
    pub name: String,
    /// Reference to the LocalDomain account
    pub local_domain: Pubkey,
    /// MAC address
    pub mac_address: [u8; 6],
    /// PDA bump seed
    pub bump: u8,
}

impl Device {
    pub const SEED_PREFIX: &'static [u8] = b"device";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
