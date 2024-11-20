use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use super::DawnApp;
use crate::{
    constants::{MAX_DEVICE_MANUFACTURER_LEN, MAX_DEVICE_MODEL_LEN},
    DawnError, DeviceAdded,
};

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum DeviceType {
    /// router device type
    Router,
    /// wireless radio device type
    WirelessRadio,
}

impl From<usize> for DeviceType {
    fn from(value: usize) -> Self {
        match value {
            0 => Self::Router,
            1 => Self::WirelessRadio,
            _ => Self::Router,
        }
    }
}

#[account]
pub struct Device {
    /// The device owner
    pub owner: Pubkey,
    /// the device type
    // pub device_type: DeviceType,
    /// the device manufacturer
    pub manufacturer: String,
    /// the device model
    pub model: String,
    /// device mac address
    // pub mac_address: [u8; 6],
    // /// device ip address `(v4)`
    // pub ip_v4: [u8; 4],
    // /// device ip address `(v6)`
    // pub ip_v6: [u8; 16],
    /// device geographical coordinates - `latitude`
    pub latitude: u64,
    /// device geographical coordinates - `longitude`
    pub longitude: u64,
    /// Device PDA bump seed
    pub bump: u8,
}

pub const DEVIEC_SIZE: usize = 8 // id
    + 32 // owner
    // + 1 // device_type
    + 24 // manufacturer
    + 24 // model
    // + 6 // mac_address
    // + 4 // ip_v4
    // + 16 // ip_v6
    + 8 // latitude
    + 8 // longitude
    + 1; // bump

#[derive(Accounts)]
#[instruction(manufacturer: String, model: String, latitude: f64, longitude: f64)]
pub struct AddDevice<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The device account
    #[account(
        init,
        payer = caller,
        space = DEVIEC_SIZE,
        seeds = [
            b"device",
            &manufacturer.trim().as_bytes()[..min(manufacturer.trim().len(), MAX_SEED_LEN)],
            &model.trim().as_bytes()[..min(model.trim().len(), MAX_SEED_LEN)],
            &latitude.to_le_bytes(),
            &longitude.to_le_bytes(),
        ],
        bump
    )]
    pub device: Account<'info, Device>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn add_device(
        ctx: Context<AddDevice>,
        // device_type: DeviceType,
        manufacturer: String,
        model: String,
        latitude: u64,
        longitude: u64,
    ) -> Result<()> {
        let device = &mut ctx.accounts.device;

        // Make sure the manufacturer and model are not empty
        if manufacturer.trim().is_empty() {
            return err!(DawnError::EmptyDeviceManufacturer);
        }
        if model.trim().is_empty() {
            return err!(DawnError::EmptyDeviceModel);
        }

        // Make sure the latitude and longitude are not eq 0
        if latitude.eq(&0u64) {
            return err!(DawnError::InvalidLatitude);
        }
        if longitude.eq(&0u64) {
            return err!(DawnError::InvalidLongitude);
        }

        // Make sure the name and address are not exceeding the max length
        if manufacturer.len() > MAX_DEVICE_MANUFACTURER_LEN {
            msg!("manufacturer.len() = {}", manufacturer.len());
            return err!(DawnError::DeviceManufacturerTooLong);
        }
        if model.len() > MAX_DEVICE_MODEL_LEN {
            msg!("model.len() = {}", model.len());
            return err!(DawnError::DeviceModelTooLong);
        }

        device.owner = ctx.accounts.caller.key();
        // device.device_type = device_type.to_owned();
        device.manufacturer = manufacturer.trim().to_owned();
        device.model = model.trim().to_owned();
        device.longitude = longitude.to_owned();
        device.latitude = latitude.to_owned();
        device.bump = ctx.bumps.device;

        emit!(DeviceAdded {
            device: device.key(),
            owner: device.owner,
            // device_type: device.device_type.clone(),
            manufacturer: device.manufacturer.clone(),
            model: device.model.clone(),
            longitude: device.longitude,
            latitude: device.latitude,
        });

        Ok(())
    }
}
