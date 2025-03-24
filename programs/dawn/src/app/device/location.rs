use anchor_lang::prelude::*;
use solana_program::pubkey::MAX_SEED_LEN;
use std::cmp::min;

use crate::{Config, DawnApp, DeviceLocationVerified};

use super::Device;

/// Device location account
#[account]
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

pub const DEVICE_LOCATION_SIZE: usize = 8 // id
    + 8  // created_at
    + 32 // device
    + 2  // height
    + 8  // latitude
    + 8  // longitude
    + (4 + 4)  // placement (azimuth, tilt)
    + 1  // verified
    + 8  // verified_at
    + 1; // bump

#[derive(Accounts)]
pub struct VerifyDeviceLocation<'info> {
    #[account(
        mut,
        constraint = caller.key() == config.authority, // caller must be the DAWN authority
    )]
    pub caller: Signer<'info>,

    #[account(seeds = [b"config".as_ref()], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [
            b"device".as_ref(),
            device.owner.as_ref(),
            device.model.as_ref(),
            &device.name.as_bytes()[..min(device.name.len(), MAX_SEED_LEN)],
            &device.mac_address,
        ],
        bump = device.bump,
    )]
    pub device: Account<'info, Device>,

    #[account(
        mut,
        seeds = [b"device_location".as_ref(), device.key().as_ref()],
        bump = device_location.bump,
    )]
    pub device_location: Account<'info, DeviceLocation>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Verifies the device location
    /// Caller must be the DAWN authority
    pub fn verify_device_location(ctx: Context<VerifyDeviceLocation>) -> Result<()> {
        let device_location = &mut ctx.accounts.device_location;

        device_location.verified = true;
        device_location.verified_at = Clock::get()?.unix_timestamp;

        emit!(DeviceLocationVerified {
            device: device_location.device,
            latitude: device_location.latitude,
            longitude: device_location.longitude,
            verified_at: device_location.verified_at,
        });

        Ok(())
    }
}
