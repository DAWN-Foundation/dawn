use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Device location account
#[account]
#[derive(InitSpace)]
pub struct DeviceLocation {
    /// The creation timestamp
    pub created_at: i64,
    /// The device account
    pub device: Pubkey,
    /// Device antenna height (meters)
    pub height: u16,
    /// Geographic position - latitude
    pub latitude: i64,
    /// Geographic position - longitude
    pub longitude: i64,
    /// The placement of the device, consists of azimuth and tilt
    /// azimuth: i32,       // Bird's eye view (horizontal angle, 0.00 - 360.00) scaled by 100
    /// tilt: i32,          // Side view (vertical angle, -90.00 - 90.00) scaled by 100
    pub placement: [i32; 2],
    /// Verified by the DAWN authority
    pub verified: bool,
    /// The verification timestamp
    pub verified_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl DeviceLocation {
    pub const SEED_PREFIX: &'static [u8] = b"device_location";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
