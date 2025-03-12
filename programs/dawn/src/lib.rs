#![allow(clippy::too_many_arguments)]

use anchor_lang::prelude::*;

#[cfg(not(feature = "devnet"))]
declare_id!("99oSHrFjjdyC6AqivbvfjXFzXgxYFzsDrMt1fEszVs1z");

#[cfg(feature = "devnet")]
declare_id!("ddwnsE29JbbYx75fyBA2undkNuMzp925NWMjBpfzuRT");

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

    pub fn init_token(ctx: Context<InitializeToken>) -> Result<()> {
        DawnApp::init_token(ctx)
    }

    pub fn init_fee_accounts(ctx: Context<InitializeFeeAccounts>) -> Result<()> {
        DawnApp::init_fee_accounts(ctx)
    }

    pub fn configure(
        ctx: Context<Configure>,
        dawn_fee: u64,
        validator_fee: u64,
        medallion_fee: u64,
    ) -> Result<()> {
        DawnApp::configure(ctx, dawn_fee, validator_fee, medallion_fee)
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

    pub fn add_site(ctx: Context<AddSite>, name: String) -> Result<()> {
        DawnApp::add_site(ctx, name)
    }

    pub fn add_device(
        ctx: Context<AddDevice>,
        name: String,
        height: u16,
        latitude: i64,
        longitude: i64,
        mac_address: [u8; 6],
    ) -> Result<()> {
        DawnApp::add_device(ctx, name, height, latitude, longitude, mac_address)
    }

    pub fn assign_device_to_site(ctx: Context<AssignDeviceToSite>) -> Result<()> {
        DawnApp::assign_device_to_site(ctx)
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

    pub fn add_service_agreement(
        ctx: Context<AddServiceAgreement>,
        threshold: u64,
        payout_ratio: u64,
    ) -> Result<()> {
        DawnApp::add_service_agreement(ctx, threshold, payout_ratio)
    }

    pub fn add_plan(
        ctx: Context<AddPlan>,
        name: String,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        start_at: Option<i64>,
        auth_methods: Vec<AuthMethod>,
    ) -> Result<()> {
        DawnApp::add_plan(
            ctx,
            name,
            price,
            duration,
            speed,
            capacity,
            start_at,
            auth_methods,
        )
    }

    pub fn subscribe<'info>(ctx: Context<'_, '_, '_, 'info, Subscribe<'info>>) -> Result<()> {
        DawnApp::subscribe(ctx)
    }

    pub fn extend_subscription<'info>(ctx: Context<ExtendSubscription>) -> Result<()> {
        DawnApp::extend_subscription(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        DawnApp::claim(ctx)
    }
}
