use anchor_lang::prelude::*;

declare_id!("79d7dzfG5hC2xCzNUrwyAdG2agBh6NM9gATyXPBr9zFq");

mod constants;
mod error;
mod events;
mod instructions;

use error::*;
use events::*;
use instructions::*;

#[program]
pub mod plan {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        dawn_fee: u64,
        andrena_fee: u64,
        andrena_dawn_split: u64,
        bo_dawn_split: u64,
        bo_escrow_split: u64,
    ) -> Result<()> {
        PlanApp::initialize(
            ctx,
            dawn_fee,
            andrena_fee,
            andrena_dawn_split,
            bo_dawn_split,
            bo_escrow_split,
        )
    }

    pub fn add_building(
        ctx: Context<AddBuilding>,
        name: String,
        address: String,
        floors: u8,
    ) -> Result<()> {
        PlanApp::add_building(ctx, name, address, floors)
    }

    pub fn add_plan(ctx: Context<AddPlan>, price: u64) -> Result<()> {
        PlanApp::add_plan(ctx, price)
    }
}
