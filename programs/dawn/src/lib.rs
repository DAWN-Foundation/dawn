use anchor_lang::prelude::*;

declare_id!("GtVh6exdiedD7cXXUxJz3Wgj3d6o3nhXqCM2uYPNfact");

mod constants;
mod error;
mod events;
mod instructions;
mod utils;

use error::*;
use events::*;
use instructions::*;

#[program]
pub mod dawn {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        dawn_fee: u64,
        validator_fee: u64,
        medallion_fee: u64,
    ) -> Result<()> {
        DawnApp::initialize(ctx, dawn_fee, validator_fee, medallion_fee)
    }

    pub fn add_building(
        ctx: Context<AddBuilding>,
        name: String,
        address: String,
        floors: u8,
    ) -> Result<()> {
        DawnApp::add_building(ctx, name, address, floors)
    }

    pub fn add_device(
        ctx: Context<AddDevice>,
        device_type: DeviceType,
        manufacturer: String,
        model: String,
        latitude: u64,
        longitude: u64,
    ) -> Result<()> {
        DawnApp::add_device(ctx, device_type, manufacturer, model, latitude, longitude)
    }

    pub fn add_plan(
        ctx: Context<AddPlan>,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        sla_id: u64,
    ) -> Result<()> {
        DawnApp::add_plan(ctx, price, duration, speed, capacity, sla_id)
    }

    pub fn remove_plan(ctx: Context<RemovePlan>) -> Result<()> {
        DawnApp::remove_plan(ctx)
    }

    pub fn subscribe<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Subscribe<'info>>,
    ) -> Result<()> {
        DawnApp::subscribe(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        DawnApp::claim(ctx)
    }
}
