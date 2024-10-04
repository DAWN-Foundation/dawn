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
        andrena_dawn_ratio: u64,
        bo_dawn_ratio: u64,
        bo_escrow_ratio: u64,
    ) -> Result<()> {
        PlanApp::initialize(
            ctx,
            dawn_fee,
            andrena_fee,
            andrena_dawn_ratio,
            bo_dawn_ratio,
            bo_escrow_ratio,
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

    pub fn add_plan(
        ctx: Context<AddPlan>,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        sla_id: u64,
    ) -> Result<()> {
        PlanApp::add_plan(ctx, price, duration, speed, capacity, sla_id)
    }

    pub fn remove_plan(ctx: Context<RemovePlan>) -> Result<()> {
        PlanApp::remove_plan(ctx)
    }

    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        PlanApp::subscribe(ctx)
    }
}
