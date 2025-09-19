use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use crate::{
    events::{DeviceAdded, DeviceLocationAdded, LocalDomainAdded},
    state::{Device, DeviceLocation, DeviceModel, LocalDomain},
    DawnApp, DawnError,
};

#[derive(Accounts)]
#[instruction(
    name: String,
    height: u16,
    latitude: u64,
    longitude: u64,
    placement: [u32; 2],
    mac_address: [u8; 6],
    local_domain_name: String,
)]
pub struct AddDevice<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The device model account
    #[account(
        seeds = [
            DeviceModel::SEED_PREFIX.as_ref(),
            device_model.device_type.to_seed(),
            &device_model.manufacturer.trim().as_bytes()[..min(device_model.manufacturer.trim().len(), MAX_SEED_LEN)],
            &device_model.model.trim().as_bytes()[..min(device_model.model.trim().len(), MAX_SEED_LEN)],
        ],
        bump = device_model.bump
    )]
    pub device_model: Box<Account<'info, DeviceModel>>,

    /// The device account
    #[account(
        init,
        payer = caller,
        space = Device::SIZE,
        seeds = [
            Device::SEED_PREFIX.as_ref(),
            caller.key().as_ref(),
            device_model.key().as_ref(),
            &name.trim().as_bytes()[..min(name.trim().len(), MAX_SEED_LEN)],
            &mac_address,
        ],
        bump
    )]
    pub device: Box<Account<'info, Device>>,

    /// The device location account
    #[account(
        init,
        payer = caller,
        space = DeviceLocation::SIZE,
        seeds = [
            DeviceLocation::SEED_PREFIX.as_ref(),
            device.key().as_ref(), // ensures one location per device
        ],
        bump
    )]
    pub device_location: Box<Account<'info, DeviceLocation>>,

    /// The local domain account
    #[account(
        init_if_needed,
        payer = caller,
        space = LocalDomain::SIZE,
        seeds = [
            LocalDomain::SEED_PREFIX.as_ref(),
            caller.key().as_ref(),
            &local_domain_name.trim().as_bytes()[..min(local_domain_name.trim().len(), MAX_SEED_LEN)]
        ],
        bump
    )]
    pub local_domain: Box<Account<'info, LocalDomain>>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn add_device(
        ctx: Context<AddDevice>,
        name: String,
        height: u16,
        latitude: i64,
        longitude: i64,
        placement: [i32; 2],
        mac_address: [u8; 6],
        local_domain_name: String,
    ) -> Result<()> {
        // Make sure the latitude, longitude and height are not eq 0
        require!(!latitude.eq(&0i64), DawnError::InvalidLatitude);
        require!(!longitude.eq(&0i64), DawnError::InvalidLongitude);
        require!(!height.eq(&0u16), DawnError::InvalidHeight);
        require!(!height.lt(&0u16), DawnError::InvalidHeight);

        // Make sure the placement.azimuth is between 0 and 360
        require!(
            placement[0] >= 0 && placement[0] <= 36000,
            DawnError::InvalidPlacementAzimuth
        );

        // Make sure the placement.tilt is between -90 and 90
        require!(
            placement[1] >= -9000 && placement[1] <= 9000,
            DawnError::InvalidPlacementTilt
        );

        // Make sure the name is not empty
        require!(!name.is_empty(), DawnError::EmptyDeviceName);

        // Make sure the name is not too long
        require!(name.len() <= 32, DawnError::DeviceNameTooLong,);

        // Make sure the local domain name is not empty or too long
        require!(
            !local_domain_name.is_empty(),
            DawnError::EmptyLocalDomainName
        );
        require!(
            local_domain_name.len() <= 32,
            DawnError::LocalDomainNameTooLong
        );

        let device = &mut ctx.accounts.device;
        let device_model = &mut ctx.accounts.device_model;
        let device_location = &mut ctx.accounts.device_location;
        let caller = ctx.accounts.caller.key();

        // Initialize local_domain if not already created
        if ctx.accounts.local_domain.created_at == 0 {
            let local_domain = &mut ctx.accounts.local_domain;
            local_domain.created_at = Clock::get()?.unix_timestamp;
            local_domain.owner = caller;
            local_domain.bump = ctx.bumps.local_domain;

            // Convert domain name to fixed-size byte array
            let domain_bytes = local_domain_name.as_bytes();
            let mut name_bytes = [0u8; 32];
            let copy_len = domain_bytes.len().min(32);
            name_bytes[..copy_len].copy_from_slice(&domain_bytes[..copy_len]);
            local_domain.name = name_bytes;

            // Emit event
            emit!(LocalDomainAdded {
                local_domain: local_domain.key(),
                owner: local_domain.owner,
                name: local_domain_name,
                created_at: local_domain.created_at,
            });
        }

        let created_at = Clock::get()?.unix_timestamp;

        // Set device info
        device.created_at = created_at;
        device.owner = caller;
        device.model = device_model.key();
        device.name.clone_from(&name);
        device.local_domain = ctx.accounts.local_domain.key();
        device.mac_address = mac_address;
        device.bump = ctx.bumps.device;

        // Set device location info
        device_location.created_at = created_at;
        device_location.device = device.key();
        device_location.height = height;
        device_location.longitude = longitude;
        device_location.latitude = latitude;
        device_location.placement = placement;
        device_location.verified = false;
        device_location.bump = ctx.bumps.device_location;

        emit!(DeviceLocationAdded {
            device_location: device_location.key(),
            device: device.key(),
            height: device_location.height,
            longitude: device_location.longitude,
            latitude: device_location.latitude,
            placement: device_location.placement,
            created_at: device_location.created_at,
        });

        // Emit event
        emit!(DeviceAdded {
            device: device.key(),
            device_location: device_location.key(),
            owner: device.owner,
            model: device.model,
            local_domain: device.local_domain,
            name,
            mac_address,
            created_at,
        });

        Ok(())
    }
}
