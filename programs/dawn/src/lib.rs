#![allow(clippy::too_many_arguments)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

#[cfg(not(feature = "devnet"))]
declare_id!("F4Yq1jQgccrzbEn9iHrA9JjQ1xyRFViDX8Xhb5FzJmaE");

#[cfg(feature = "devnet")]
declare_id!("Fgnro1Xh59RyYiArHHEmNZ1TryTXsLtdu9fKDeQ86thz");

mod app;
mod constants;
mod error;
mod events;
mod utils;

use app::*;
use error::*;
use events::*;

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

    pub fn register_auth_method(
        ctx: Context<RegisterAuthMethod>,
        method_type: AuthMethodType,
        parameters: [u8; 256],
    ) -> Result<()> {
        DawnApp::register_auth_method(ctx, method_type, parameters)
    }

    pub fn add_auth_method(ctx: Context<AddAuthMethod>) -> Result<()> {
        DawnApp::add_auth_method(ctx)
    }

    pub fn register_credential(
        ctx: Context<RegisterCredential>,
        client: Pubkey,
        credential_data: [u8; 128],
    ) -> Result<()> {
        DawnApp::register_credential(ctx, client, credential_data)
    }

    pub fn revoke_credential(ctx: Context<RevokeCredential>) -> Result<()> {
        DawnApp::revoke_credential(ctx)
    }

    pub fn register_connection(
        ctx: Context<RegisterConnection>,
        entity_a: Pubkey,
        entity_b: Pubkey,
        credential_data_a: [u8; 64],
        credential_data_b: [u8; 64],
    ) -> Result<()> {
        DawnApp::register_connection(
            ctx,
            entity_a,
            entity_b,
            credential_data_a,
            credential_data_b,
        )
    }

    pub fn revoke_connection(ctx: Context<RevokeConnection>) -> Result<()> {
        DawnApp::revoke_connection(ctx)
    }

    // pub fn add_ip_pool(
    //     ctx: Context<AddIpPool>,
    //     ip_v4: [u8; 4],
    //     ip_v4_cidr_mask: u8,
    //     ip_v6: [u16; 16],
    //     ip_v6_cidr_mask: u8,
    // ) -> Result<()> {
    //     DawnApp::add_ip_pool(ctx, ip_v4, ip_v4_cidr_mask, ip_v6, ip_v6_cidr_mask)
    // }

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
        placement: [i32; 2],
        mac_address: [u8; 6],
        local_domain_name: String,
    ) -> Result<()> {
        DawnApp::add_device(
            ctx,
            name,
            height,
            latitude,
            longitude,
            placement,
            mac_address,
            local_domain_name,
        )
    }

    pub fn assign_device_to_site(ctx: Context<AssignDeviceToSite>) -> Result<()> {
        DawnApp::assign_device_to_site(ctx)
    }

    // pub fn lease_ip(
    //     ctx: Context<LeaseIp>,
    //     ip_v4: [u8; 4],
    //     ip_v4_cidr_mask: u8,
    //     ip_v6: [u16; 16],
    //     ip_v6_cidr_mask: u8,
    // ) -> Result<()> {
    //     DawnApp::lease_ip(ctx, ip_v4, ip_v4_cidr_mask, ip_v6, ip_v6_cidr_mask)
    // }

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

    pub fn add_l3_plan(
        ctx: Context<AddL3Plan>,
        name: String,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        start_at: Option<i64>,
    ) -> Result<()> {
        DawnApp::add_l3_plan(ctx, name, price, duration, speed, capacity, start_at)
    }

    pub fn add_l2_plan(
        ctx: Context<AddL2Plan>,
        name: String,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        start_at: Option<i64>,
    ) -> Result<()> {
        DawnApp::add_l2_plan(ctx, name, price, duration, speed, capacity, start_at)
    }

    pub fn subscribe<'info>(ctx: Context<'_, '_, '_, 'info, Subscribe<'info>>) -> Result<()> {
        DawnApp::subscribe(ctx)
    }

    pub fn extend_subscription(ctx: Context<ExtendSubscription>) -> Result<()> {
        DawnApp::extend_subscription(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        DawnApp::claim(ctx)
    }
}
