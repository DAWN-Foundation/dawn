use anchor_lang::prelude::*;
use solana_program::pubkey::MAX_SEED_LEN;
use std::cmp::min;

use crate::{
    app::{DeviceType, OrganizationType, ACCESS_DOMAIN_SIZE, ORGANIZATION_SIZE},
    DawnApp, DawnError, DeviceAdded,
};

use super::{AccessDomain, DeviceLocation, DeviceModel, Organization, Site, DEVICE_LOCATION_SIZE};

const END_USER_ORG_NAME: &'static str = "end_user_organization";

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
    + 6  // mac_address
    + 1; // bump

#[derive(Accounts)]
#[instruction(name: String, height: u16, latitude: u64, longitude: u64, mac_address: [u8; 6])]
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
            &name.trim().as_bytes()[..min(name.trim().len(), MAX_SEED_LEN)],
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
    pub organization: Account<'info, Organization>,

    /// The access domain account
    #[account(
        init_if_needed,
        payer = caller,
        space = ACCESS_DOMAIN_SIZE,
        seeds = [b"access_domain", device.key().as_ref()],
        bump
    )]
    pub access_domain: Option<Account<'info, AccessDomain>>,

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
    pub site: Option<Account<'info, Site>>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn add_device(
        ctx: Context<AddDevice>,
        name: String,
        height: u16,
        latitude: i64,
        longitude: i64,
        mac_address: [u8; 6],
    ) -> Result<()> {
        // Make sure the latitude, longitude and height are not eq 0
        require!(!latitude.eq(&0i64), DawnError::InvalidLatitude);
        require!(!longitude.eq(&0i64), DawnError::InvalidLongitude);
        require!(!height.eq(&0u16), DawnError::InvalidHeight);
        require!(!height.lt(&0u16), DawnError::InvalidHeight);

        // Make sure the name is not empty
        require!(!name.is_empty(), DawnError::EmptyDeviceName);

        // Make sure the name is not too long
        require!(name.len() <= 32, DawnError::DeviceNameTooLong,);

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
                    access_domain.bump = ctx.bumps.access_domain;
                }
                None => {
                    return Err(DawnError::AccessDomainRequired.into());
                }
            }
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
        device_location.verified = false;
        device_location.bump = ctx.bumps.device_location;

        // Emit event
        emit!(DeviceAdded {
            device: device.key(),
            owner: device.owner,
            site,
            model: device.model,
            organization: organization.key(),
            name,
            latitude,
            longitude,
            height,
            mac_address,
            created_at,
        });

        Ok(())
    }
}
