use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use crate::{
    app::{DeviceType, OrganizationType, ACCESS_DOMAIN_SIZE, LOCAL_DOMAIN_SIZE, ORGANIZATION_SIZE},
    DawnApp, DawnError, DeviceAdded,
};

use super::{
    AccessDomain, DeviceLocation, DeviceModel, LocalDomain, Organization, Site,
    DEVICE_LOCATION_SIZE,
};

const END_USER_ORG_NAME: &str = "end_user_organization";

/// The device account, representing a device
#[account]
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
    pub name: String,
    /// Reference to the LocalDomain account
    pub local_domain: Pubkey,
    /// MAC address
    pub mac_address: [u8; 6],
    /// PDA bump seed
    pub bump: u8,
}

pub const DEVICE_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // owner
    + (1 + 32) // optional + site
    + 32 // model
    + 32 // organization
    + (1 + 32) // optional + infra_ip
    + (4 + 32) // name
    + 32 // local_domain
    + 6  // mac_address
    + 1; // bump

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
            b"device_model",
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
        space = DEVICE_SIZE,
        seeds = [
            b"device",
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
        space = DEVICE_LOCATION_SIZE,
        seeds = [
            b"device_location",
            device.key().as_ref(), // ensures one location per device
        ],
        bump
    )]
    pub device_location: Box<Account<'info, DeviceLocation>>,

    /// The organization account
    #[account(
        init_if_needed,
        payer = caller,
        space = ORGANIZATION_SIZE,
        seeds = [
            b"organization",
            caller.key().as_ref(),
            OrganizationType::EndUser.to_seed(),
            END_USER_ORG_NAME.as_bytes(),
        ],
        bump
    )]
    pub organization: Box<Account<'info, Organization>>,

    /// The access domain account
    #[account(
        init_if_needed,
        payer = caller,
        space = ACCESS_DOMAIN_SIZE,
        seeds = [b"access_domain", device.key().as_ref()],
        bump
    )]
    pub access_domain: Option<Box<Account<'info, AccessDomain>>>,

    /// The site account
    #[account(
        seeds = [
            b"site",
            site.owner.as_ref(),
            &site.name.as_bytes()[..min(site.name.len(), MAX_SEED_LEN)],
        ],
        bump = site.bump,
        constraint = site.owner == caller.key(),
    )]
    pub site: Option<Box<Account<'info, Site>>>,

    /// The local domain account
    #[account(
        init_if_needed,
        payer = caller,
        space = LOCAL_DOMAIN_SIZE,
        seeds = [
            b"local_domain",
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
        let device_location = &mut ctx.accounts.device_location;
        let organization = &mut ctx.accounts.organization;
        let access_domain = &mut ctx.accounts.access_domain;
        let caller = ctx.accounts.caller.key();

        // if device_type is Router (L3), create access_domain
        if ctx.accounts.device_model.device_type == DeviceType::Router {
            match access_domain {
                Some(access_domain) => {
                    access_domain.created_at = Clock::get()?.unix_timestamp;
                    access_domain.owner = caller;
                    access_domain.device = device.key();
                    access_domain.bump = ctx.bumps.access_domain.unwrap();
                }
                None => {
                    return Err(DawnError::AccessDomainRequired.into());
                }
            }
        }

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
        }

        let created_at = Clock::get()?.unix_timestamp;
        let site = ctx.accounts.site.as_ref().map(|site| site.key());

        // Set device info
        device.created_at = created_at;
        device.owner = caller;
        device.site = site;
        device.model = ctx.accounts.device_model.key();
        device.organization = organization.key();
        device.name.clone_from(&name);
        device.local_domain = ctx.accounts.local_domain.key();
        device.mac_address = mac_address;
        device.bump = ctx.bumps.device;

        // Set organization info
        organization.created_at = created_at;
        organization.owner = caller;
        organization.organization_type = OrganizationType::EndUser;
        organization.name = END_USER_ORG_NAME.into();
        organization.bump = ctx.bumps.organization;

        // Set device location info
        device_location.created_at = created_at;
        device_location.device = device.key();
        device_location.height = height;
        device_location.longitude = longitude;
        device_location.latitude = latitude;
        device_location.placement = placement;
        device_location.verified = false;
        device_location.bump = ctx.bumps.device_location;

        // Emit event
        emit!(DeviceAdded {
            device: device.key(),
            device_location: device_location.key(),
            owner: device.owner,
            site,
            model: device.model,
            organization: organization.key(),
            local_domain: device.local_domain,
            name,
            latitude,
            longitude,
            height,
            placement,
            mac_address,
            created_at,
        });

        Ok(())
    }
}
