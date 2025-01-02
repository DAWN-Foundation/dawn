use anchor_lang::prelude::*;

declare_id!("BNf8E3y61JVMzm65Va5rzacyec8axAx86YvvjZwBvx6S");

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

    pub fn add_ip_pool(
        ctx: Context<AddIpPool>,
        ip_v4: [u8; 4],
        ip_v4_cidr_mask: u8,
        ip_v6: [u16; 16],
        ip_v6_cidr_mask: u8,
    ) -> Result<()> {
        DawnApp::add_ip_pool(ctx, ip_v4, ip_v4_cidr_mask, ip_v6, ip_v6_cidr_mask)
    }

    pub fn add_device_model(
        ctx: Context<AddDeviceModel>,
        device_type: DeviceType,
        manufacturer: String,
        model: String,
    ) -> Result<()> {
        DawnApp::add_device_model(ctx, device_type, manufacturer, model)
    }

    pub fn add_device(
        ctx: Context<AddDevice>,
        latitude: i64,
        longitude: i64,
        mac_address: [u8; 6],
    ) -> Result<()> {
        DawnApp::add_device(ctx, latitude, longitude, mac_address)
    }

    pub fn lease_ip(
        ctx: Context<LeaseIp>,
        ip_v4: [u8; 4],
        ip_v4_cidr_mask: u8,
        ip_v6: [u16; 16],
        ip_v6_cidr_mask: u8,
    ) -> Result<()> {
        DawnApp::lease_ip(ctx, ip_v4, ip_v4_cidr_mask, ip_v6, ip_v6_cidr_mask)
    }

    pub fn verify_device_location(ctx: Context<VerifyDeviceLocation>) -> Result<()> {
        DawnApp::verify_device_location(ctx)
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

    // pub fn remove_plan(ctx: Context<RemovePlan>) -> Result<()> {
    //     DawnApp::remove_plan(ctx)
    // }

    pub fn subscribe<'info>(ctx: Context<'_, '_, '_, 'info, Subscribe<'info>>) -> Result<()> {
        DawnApp::subscribe(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        DawnApp::claim(ctx)
    }
}
