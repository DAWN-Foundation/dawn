use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use super::PlanApp;
use crate::{
    constants::{MAX_BUILDING_ADDRESS_LEN, MAX_BUILDING_NAME_LEN},
    BuildingAdded, PlanError,
};

#[account]
pub struct Building {
    /// The building owner
    pub owner: Pubkey,
    /// The building name
    pub name: String,
    /// The building address
    pub address: String,
    /// Total number of floors
    pub floors: u8,
    /// Building PDA bump seed
    pub bump: u8,
}

pub const BUILDING_SIZE: usize = 8 // id
    + 32 // owner
    + (4 + MAX_BUILDING_NAME_LEN) // name
    + (4 + MAX_BUILDING_ADDRESS_LEN) // address
    + 1 // floors
    + 1; // bump

#[derive(Accounts)]
#[instruction(name: String, address: String, floors: u8)]
pub struct AddBuilding<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The building account
    #[account(
        init,
        payer = caller,
        space = BUILDING_SIZE,
        seeds = [
            b"building",
            &name.trim().as_bytes()[..min(name.trim().len(), MAX_SEED_LEN)],
            &address.trim().as_bytes()[..min(address.trim().len(), MAX_SEED_LEN)],
            &[floors],
        ],
        bump
    )]
    pub building: Account<'info, Building>,

    pub system_program: Program<'info, System>,
}

impl PlanApp {
    pub fn add_building(
        ctx: Context<AddBuilding>,
        name: String,
        address: String,
        floors: u8,
    ) -> Result<()> {
        let building = &mut ctx.accounts.building;

        // Make sure the name and address are not empty
        if name.trim().is_empty() {
            return err!(PlanError::EmptyBuildingName);
        }
        if address.trim().is_empty() {
            return err!(PlanError::EmptyBuildingAddress);
        }

        // Make sure the name and address are not exceeding the max length
        if name.len() > MAX_BUILDING_NAME_LEN {
            msg!("name.len() = {}", name.len());
            return err!(PlanError::BuildingNameTooLong);
        }
        if address.len() > MAX_BUILDING_ADDRESS_LEN {
            return err!(PlanError::BuildingAddressTooLong);
        }

        // Make sure the floors are between 1 and 255 (ensured by u8 type)
        if floors == 0 {
            return err!(PlanError::InvalidFloors);
        }

        building.owner = ctx.accounts.caller.key();
        building.name = name.trim().to_owned();
        building.address = address.trim().to_owned();
        building.floors = floors;
        building.bump = ctx.bumps.building;

        emit!(BuildingAdded {
            owner: building.owner,
            name: building.name.clone(),
            address: building.address.clone(),
            floors: building.floors,
        });

        Ok(())
    }
}
