use anchor_lang::prelude::*;

use crate::{Config, DawnApp, DeviceLocationVerified};

use super::Device;

/// Device location account
#[account]
pub struct DeviceLocation {
    /// The device account
    pub device: Pubkey,
    /// Geographic position - latitude
    pub latitude: i128,
    /// Geographic position - longitude
    pub longitude: i128,
    /// Verified by the DAWN authority
    pub verified: bool,
    /// PDA bump seed
    pub bump: u8,
}

pub const DEVICE_LOCATION_SIZE: usize = 8 // id
    + 32 // device
    + 16 // latitude
    + 16 // longitude
    + 1 // verified
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

        emit!(DeviceLocationVerified {
            device: device_location.device,
            latitude: device_location.latitude,
            longitude: device_location.longitude,
        });

        Ok(())
    }
}
