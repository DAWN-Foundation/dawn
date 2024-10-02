use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use super::PlanApp;

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

#[derive(Accounts)]
#[instruction(name: String, address: String)]
pub struct AddBuilding<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The building account
    #[account(
        init,
        payer = caller,
        space = 8 + 32 + name.len() + address.len() + 1 + 1, // 32 for owner, 1 for floors, 1 for bump
        seeds = [b"building", name.as_bytes(), address.as_bytes()],
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

        building.owner = ctx.accounts.caller.key();
        building.name = name;
        building.address = address;
        building.floors = floors;
        building.bump = ctx.bumps.building;

        Ok(())
    }
}
