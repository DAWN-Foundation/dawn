use anchor_lang::prelude::*;

declare_id!("7VuWWEAgNE1PbcgwSPjbXQ8BD5R8fHQE6L7fCzZ3x8Gc");

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
        validator_fee: u64,
        medallion_fee: u64,
    ) -> Result<()> {
        PlanApp::initialize(ctx, dawn_fee, validator_fee, medallion_fee)
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

    pub fn subscribe<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Subscribe<'info>>,
    ) -> Result<()> {
        PlanApp::subscribe(ctx)
    }
}
