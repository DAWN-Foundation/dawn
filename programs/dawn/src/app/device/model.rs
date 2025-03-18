use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use crate::{
    constants::{MAX_DEVICE_MANUFACTURER_LEN, MAX_DEVICE_MODEL_LEN},
    Config, DawnApp, DawnError, DeviceModelAdded,
};

use super::DeviceType;

/// The device model account, representing a device model
#[account]
pub struct DeviceModel {
    /// The creation timestamp
    pub created_at: i64,
    /// The type of device
    pub device_type: DeviceType,
    /// Device manufacturer name
    pub manufacturer: String,
    /// Specific model identifier
    pub model: String,
    /// PDA bump seed
    pub bump: u8,
}

pub const DEVICE_MODEL_SIZE: usize = 8 // id
    + 8 // created_at
    + 1 // device_type
    + (4 + MAX_DEVICE_MANUFACTURER_LEN) // manufacturer
    + (4 + MAX_DEVICE_MODEL_LEN) // model
    + 1; // bump

#[derive(Accounts)]
#[instruction(device_type: DeviceType, manufacturer: String, model: String)]
pub struct AddDeviceModel<'info> {
    #[account(mut, constraint = caller.key() == config.authority )]
    pub caller: Signer<'info>,

    /// The config account
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    /// The device model account
    #[account(
        init,
        payer = caller,
        space = DEVICE_MODEL_SIZE,
        seeds = [
            b"device_model",
            device_type.to_seed(),
            &manufacturer.trim().as_bytes()[..min(manufacturer.trim().len(), MAX_SEED_LEN)],
            &model.trim().as_bytes()[..min(model.trim().len(), MAX_SEED_LEN)],
        ],
        bump
    )]
    pub device_model: Account<'info, DeviceModel>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn add_device_model(
        ctx: Context<AddDeviceModel>,
        device_type: DeviceType,
        manufacturer: String,
        model: String,
    ) -> Result<()> {
        let device_model = &mut ctx.accounts.device_model;

        // Make sure the manufacturer and model are not empty
        require!(
            !manufacturer.trim().is_empty(),
            DawnError::EmptyDeviceManufacturer
        );
        require!(!model.trim().is_empty(), DawnError::EmptyDeviceModel);

        // Make sure the name and address are not exceeding the max length
        require!(
            manufacturer.len() <= MAX_DEVICE_MANUFACTURER_LEN,
            DawnError::DeviceManufacturerTooLong
        );
        require!(
            model.len() <= MAX_DEVICE_MODEL_LEN,
            DawnError::DeviceModelTooLong
        );

        device_model.created_at = Clock::get()?.unix_timestamp;
        device_model.device_type = device_type.clone();
        manufacturer
            .trim()
            .clone_into(&mut device_model.manufacturer);
        model.trim().clone_into(&mut device_model.model);
        device_model.bump = ctx.bumps.device_model;

        emit!(DeviceModelAdded {
            device_model: device_model.key(),
            device_type,
            manufacturer: manufacturer.trim().to_owned(),
            model: model.trim().to_owned(),
            created_at: device_model.created_at,
        });

        Ok(())
    }
}
