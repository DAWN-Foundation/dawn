use anchor_lang::prelude::*;
use solana_program::pubkey::MAX_SEED_LEN;
use std::cmp::min;

use crate::{DawnApp, DawnError, DeviceAdded};

use super::{DeviceLocation, DeviceModel, DEVICE_LOCATION_SIZE};

#[account]
pub struct Device {
    /// The owner's public key who registered this device
    pub owner: Pubkey,
    /// Reference to the DeviceModel account
    pub model: Pubkey,
    /// MAC address
    pub mac_address: [u8; 6],
    /// PDA bump seed
    pub bump: u8,
}

pub const DEVICE_SIZE: usize = 8 // id
    + 32 // owner
    + 32 // model
    + 6  // mac_address
    + 1; // bump

#[derive(Accounts)]
#[instruction(height: i8, latitude: u64, longitude: u64, mac_address: [u8; 6])]
pub struct AddDevice<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The device model account
    #[account(
        seeds = [
            b"device_model",
            device_model.device_type.to_seed(),
            &device_model.manufacturer.trim().as_bytes()[..min(device_model.manufacturer.trim().len(), MAX_SEED_LEN)],
            &device_model.model.trim().as_bytes()[..min(device_model.model.trim().len(), MAX_SEED_LEN)],
        ],
        bump = device_model.bump
    )]
    pub device_model: Account<'info, DeviceModel>,

    /// The device account
    #[account(
        init,
        payer = caller,
        space = DEVICE_SIZE,
        seeds = [
            b"device",
            caller.key().as_ref(),
            device_model.key().as_ref(),
            &mac_address,
        ],
        bump
    )]
    pub device: Account<'info, Device>,

    /// The device location account
    #[account(
        init,
        payer = caller,
        space = DEVICE_LOCATION_SIZE,
        seeds = [
            b"device_location",
            device.key().as_ref(), // ensures one location per device
        ],
        bump
    )]
    pub device_location: Account<'info, DeviceLocation>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn add_device(
        ctx: Context<AddDevice>,
        height: i8,
        latitude: i64,
        longitude: i64,
        mac_address: [u8; 6],
    ) -> Result<()> {
        // Make sure the latitude, longitude and height are not eq 0
        require!(!latitude.eq(&0i64), DawnError::InvalidLatitude);
        require!(!longitude.eq(&0i64), DawnError::InvalidLongitude);
        require!(!height.eq(&0i8), DawnError::InvalidHeight);
        require!(!height.lt(&0i8), DawnError::InvalidHeight);

        let device = &mut ctx.accounts.device;
        let device_location = &mut ctx.accounts.device_location;

        // Set device info
        device.owner = ctx.accounts.caller.key();
        device.model = ctx.accounts.device_model.key();
        device.mac_address = mac_address;
        device.bump = ctx.bumps.device;

        // Set device location info
        device_location.device = device.key();
        device_location.height = height;
        device_location.longitude = longitude;
        device_location.latitude = latitude;
        device_location.verified = false;
        device_location.bump = ctx.bumps.device_location;

        // Emit event
        emit!(DeviceAdded {
            device: device.key(),
            owner: device.owner,
            model: device.model,
            latitude,
            longitude,
            height,
            mac_address,
        });

        Ok(())
    }
}
