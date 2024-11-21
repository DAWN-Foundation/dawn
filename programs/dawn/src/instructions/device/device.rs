use anchor_lang::prelude::*;
use solana_program::pubkey::MAX_SEED_LEN;
use std::cmp::min;

use crate::{DawnApp, DawnError, DeviceAdded};

use super::DeviceModel;

#[account]
pub struct Device {
    /// The owner's public key who registered this device
    pub owner: Pubkey,
    /// Reference to the DeviceModel account
    pub model: Pubkey,
    /// device geographical coordinates - `latitude`
    pub latitude: u64,
    /// device geographical coordinates - `longitude`
    pub longitude: u64,
    /// Device PDA bump seed
    pub bump: u8,
}

pub const DEVICE_SIZE: usize = 8 // id
    + 32 // owner
    + 32 // model
    + 8 // latitude
    + 8 // longitude
    + 1; // bump

#[derive(Accounts)]
#[instruction(latitude: u64, longitude: u64)]
pub struct AddDevice<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The device model account
    #[account(
        seeds = [
            b"device_model",
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
            &latitude.to_le_bytes(),
            &longitude.to_le_bytes(),
        ],
        bump
    )]
    pub device: Account<'info, Device>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn add_device(ctx: Context<AddDevice>, latitude: u64, longitude: u64) -> Result<()> {
        let device = &mut ctx.accounts.device;

        // Make sure the latitude and longitude are not eq 0
        require!(!latitude.eq(&0u64), DawnError::InvalidLatitude);
        require!(!longitude.eq(&0u64), DawnError::InvalidLongitude);

        device.owner = ctx.accounts.caller.key();
        device.model = ctx.accounts.device_model.key();
        device.longitude = longitude.to_owned();
        device.latitude = latitude.to_owned();
        device.bump = ctx.bumps.device;

        emit!(DeviceAdded {
            device: device.key(),
            owner: device.owner,
            model: device.model,
            longitude: device.longitude,
            latitude: device.latitude,
        });

        Ok(())
    }
}
