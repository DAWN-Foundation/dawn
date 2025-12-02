use anchor_lang::prelude::*;

use crate::{
    constants::{MAX_DEVICE_MANUFACTURER_LEN, MAX_DEVICE_MODEL_LEN},
    state::{DeviceModel, DeviceType},
    utils::hash_string_seed,
    Config, DawnApp, DawnError, DeviceModelAdded,
};

#[derive(Accounts)]
#[instruction(device_type: DeviceType, manufacturer: String, model: String)]
pub struct AddDeviceModel<'info> {
    #[account(mut, constraint = caller.key() == config.authority )]
    pub caller: Signer<'info>,

    /// The config account
    #[account(seeds = [Config::SEED_PREFIX.as_ref()], bump = config.bump)]
    pub config: Account<'info, Config>,

    /// The device model account
    #[account(
        init,
        payer = caller,
        space = DeviceModel::SIZE,
        seeds = [
            DeviceModel::SEED_PREFIX.as_ref(),
            device_type.to_seed(),
            &hash_string_seed(&manufacturer.trim()),
            &hash_string_seed(&model.trim()),
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
