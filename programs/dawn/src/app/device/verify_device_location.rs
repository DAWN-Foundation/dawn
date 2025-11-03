use anchor_lang::prelude::*;

use crate::{
    state::{Device, DeviceLocation},
    utils::hash_string_seed,
    Config, DawnApp, DeviceLocationVerified,
};

#[derive(Accounts)]
pub struct VerifyDeviceLocation<'info> {
    #[account(
        mut,
        constraint = caller.key() == config.authority, // caller must be the DAWN authority
    )]
    pub caller: Signer<'info>,

    #[account(seeds = [Config::SEED_PREFIX.as_ref()], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [
            Device::SEED_PREFIX.as_ref(),
            device.owner.as_ref(),
            device.model.as_ref(),
            &hash_string_seed(&device.name),
            &device.mac_address,
        ],
        bump = device.bump,
    )]
    pub device: Account<'info, Device>,

    #[account(
        mut,
        seeds = [DeviceLocation::SEED_PREFIX.as_ref(), device.key().as_ref()],
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
            device_location: device_location.key(),
            verified_at: device_location.verified_at,
        });

        Ok(())
    }
}
