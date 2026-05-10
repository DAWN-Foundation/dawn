#![allow(clippy::too_many_arguments)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

#[cfg(not(feature = "devnet"))]
declare_id!("4yBWXvJ2otyMvkBewgKhnkJ7WP1c7HHDSicdQwH4dXqC");

#[cfg(feature = "devnet")]
declare_id!("dawnt36j2ej84PXrEjrxDjmQb5nAAqCVwTP8f1Y1aYu");

mod app;
mod constants;
mod error;
mod events;
pub mod state; // Make state module public so API can import types
mod utils;

use app::*;
use error::*;
use events::*;
use state::*;

#[program]
pub mod dawn {
    use super::*;

    pub fn init_token(ctx: Context<InitializeToken>) -> Result<()> {
        DawnApp::init_token(ctx)
    }

    pub fn init_fee_accounts(ctx: Context<InitializeFeeAccounts>) -> Result<()> {
        DawnApp::init_fee_accounts(ctx)
    }

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        dao_fee: u64,
        validator_fee: u64,
        medallion_fee: u64,
    ) -> Result<()> {
        DawnApp::initialize_config(ctx, dao_fee, validator_fee, medallion_fee)
    }

    pub fn init_metadata(ctx: Context<InitializeMetadata>) -> Result<()> {
        DawnApp::init_metadata(ctx)
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        dao_fee: Option<u64>,
        validator_fee: Option<u64>,
        medallion_fee: Option<u64>,
        raydium: Option<Pubkey>,
        raydium_authority: Option<Pubkey>,
        raydium_pool: Option<Pubkey>,
        raydium_config: Option<Pubkey>,
        raydium_observation: Option<Pubkey>,
    ) -> Result<()> {
        DawnApp::update_config(
            ctx,
            dao_fee,
            validator_fee,
            medallion_fee,
            raydium,
            raydium_authority,
            raydium_pool,
            raydium_config,
            raydium_observation,
        )
    }

    // ---- AccessDomain (lifecycle) ----------------------------------

    pub fn add_access_domain(
        ctx: Context<AddAccessDomain>,
        name: String,
        control_plane_device: Pubkey,
        gateway_device: Option<Pubkey>,
        local_domain: Option<Pubkey>,
        external_uuid: Option<[u8; 16]>,
    ) -> Result<()> {
        DawnApp::add_access_domain(
            ctx,
            name,
            control_plane_device,
            gateway_device,
            local_domain,
            external_uuid,
        )
    }

    pub fn set_control_plane_device(
        ctx: Context<SetControlPlaneDevice>,
        new_control_plane_device: Pubkey,
    ) -> Result<()> {
        DawnApp::set_control_plane_device(ctx, new_control_plane_device)
    }

    pub fn set_access_domain_gateway_device(
        ctx: Context<SetAccessDomainGatewayDevice>,
        new_gateway_device: Option<Pubkey>,
    ) -> Result<()> {
        DawnApp::set_access_domain_gateway_device(ctx, new_gateway_device)
    }

    // ---- DomainAuthority (Tier-2 grants) ---------------------------

    pub fn grant_domain_authority_for_access_domain(
        ctx: Context<GrantDomainAuthorityForAccessDomain>,
        role: DomainAuthorityRole,
        authority: Pubkey,
        label: Option<String>,
        expires_at: Option<i64>,
    ) -> Result<()> {
        DawnApp::grant_domain_authority_for_access_domain(ctx, role, authority, label, expires_at)
    }

    pub fn revoke_domain_authority_for_access_domain(
        ctx: Context<RevokeDomainAuthorityForAccessDomain>,
    ) -> Result<()> {
        DawnApp::revoke_domain_authority_for_access_domain(ctx)
    }

    // ---- AMF (auth methods + credentials) --------------------------

    pub fn register_auth_method(
        ctx: Context<RegisterAuthMethod>,
        method_type: AuthMethodType,
        parameters: [u8; 256],
    ) -> Result<()> {
        DawnApp::register_auth_method(ctx, method_type, parameters)
    }

    pub fn update_auth_method_params(
        ctx: Context<UpdateAuthMethodParams>,
        new_parameters: [u8; 256],
    ) -> Result<()> {
        DawnApp::update_auth_method_params(ctx, new_parameters)
    }

    pub fn register_credential(
        ctx: Context<RegisterCredential>,
        vlan_id: Option<u16>,
        qos_tag: Option<u8>,
        sealed_payload: [u8; 128],
    ) -> Result<()> {
        DawnApp::register_credential(ctx, vlan_id, qos_tag, sealed_payload)
    }

    pub fn register_credential_for(
        ctx: Context<RegisterCredentialFor>,
        vlan_id: Option<u16>,
        qos_tag: Option<u8>,
        sealed_payload: [u8; 128],
    ) -> Result<()> {
        DawnApp::register_credential_for(ctx, vlan_id, qos_tag, sealed_payload)
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

    pub fn add_device_for(
        ctx: Context<AddDeviceFor>,
        name: String,
        height: u16,
        latitude: i64,
        longitude: i64,
        placement: [i32; 2],
        mac_address: [u8; 6],
        local_domain_name: String,
    ) -> Result<()> {
        DawnApp::add_device_for(
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

    pub fn subscribe<'info>(
        ctx: Context<'_, '_, '_, 'info, Subscribe<'info>>,
        min_dawn_out: u64,
        deadline: i64,
    ) -> Result<()> {
        DawnApp::subscribe(ctx, min_dawn_out, deadline)
    }

    pub fn subscribe_for(
        ctx: Context<SubscribeFor>,
        min_dawn_out: u64,
        deadline: i64,
    ) -> Result<()> {
        DawnApp::subscribe_for(ctx, min_dawn_out, deadline)
    }

    pub fn extend_subscription(
        ctx: Context<ExtendSubscription>,
        min_dawn_out: u64,
        deadline: i64,
    ) -> Result<()> {
        DawnApp::extend_subscription(ctx, min_dawn_out, deadline)
    }

    pub fn extend_subscription_for(
        ctx: Context<ExtendSubscriptionFor>,
        min_dawn_out: u64,
        deadline: i64,
    ) -> Result<()> {
        DawnApp::extend_subscription_for(ctx, min_dawn_out, deadline)
    }

    pub fn claim(ctx: Context<Claim>, min_dawn_out: u64, deadline: i64) -> Result<()> {
        DawnApp::claim(ctx, min_dawn_out, deadline)
    }

    // IPAM Instructions
    pub fn initialize_root_ip_block(
        ctx: Context<InitializeRootIpBlock>,
        tier: u8, // Tier enum serialized as u8
        base_ipv4: u32,
        base_cidr: u8,
    ) -> Result<()> {
        let tier_enum = IpTier::from_u8(tier).ok_or(DawnError::InvalidTier)?;
        DawnApp::initialize_root_ip_block(ctx, tier_enum, base_ipv4, base_cidr)
    }

    pub fn allocate_ip(ctx: Context<AllocateIp>, tier: u8) -> Result<()> {
        let tier_enum = IpTier::from_u8(tier).ok_or(DawnError::InvalidTier)?;
        DawnApp::allocate_ip(ctx, tier_enum)
    }

    pub fn lease_subscription_ip(ctx: Context<LeaseSubscriberIp>) -> Result<()> {
        DawnApp::lease_subscription_ip(ctx)
    }

    pub fn lease_subscription_ip_for(ctx: Context<LeaseSubscriberIpFor>) -> Result<()> {
        DawnApp::lease_subscription_ip_for(ctx)
    }

    pub fn revoke_ip(ctx: Context<RevokeIp>, tier: u8) -> Result<()> {
        let tier_enum = IpTier::from_u8(tier).ok_or(DawnError::InvalidTier)?;
        DawnApp::revoke_ip(ctx, tier_enum)
    }

    // ---- access-domain authenticators (Access Points) ----------------------
    pub fn register_authenticator(
        ctx: Context<RegisterAuthenticator>,
        mac_address: [u8; 6],
        initial_pubkey: Pubkey,
        device: Option<Pubkey>,
        label: Option<String>,
        expires_at: Option<i64>,
    ) -> Result<()> {
        DawnApp::register_authenticator(
            ctx,
            mac_address,
            initial_pubkey,
            device,
            label,
            expires_at,
        )
    }

    pub fn rotate_authenticator_pubkey(
        ctx: Context<RotateAuthenticatorPubkey>,
        new_pubkey: Pubkey,
    ) -> Result<()> {
        DawnApp::rotate_authenticator_pubkey(ctx, new_pubkey)
    }

    pub fn revoke_authenticator(ctx: Context<RevokeAuthenticator>) -> Result<()> {
        DawnApp::revoke_authenticator(ctx)
    }
}
