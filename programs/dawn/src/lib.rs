#![allow(clippy::too_many_arguments)]

//! DAWN Access-Domain Program (lean build)
//!
//! Single-purpose: AccessDomain identity, AuthMethod scheme, Credential
//! mint/revoke, DomainAuthority delegation. No tokens, no plans, no
//! distribution domains, no IPAM. Designed for permissioned deployment
//! where key custody is the primary access-control mechanism.
//!
//! Three production roles:
//!   1. Cold admin — `Config.authority` and `AccessDomain.owner`. HSM /
//!      cold storage in production. Setup-only.
//!   2. Registrar — `DomainAuthority{role=Registrar}.authority`. Hot
//!      operator-api wallet. Mints customer credentials.
//!   3. Control plane node — owner of the Device pointed at by
//!      `AccessDomain.control_plane_device`. Hot AAA service wallet.
//!      Holds the Ed25519 secret that decrypts credential payloads.

use anchor_lang::prelude::*;

#[cfg(not(feature = "devnet"))]
declare_id!("4yBWXvJ2otyMvkBewgKhnkJ7WP1c7HHDSicdQwH4dXqC");

#[cfg(feature = "devnet")]
declare_id!("dawnt36j2ej84PXrEjrxDjmQb5nAAqCVwTP8f1Y1aYu");

mod app;
mod constants;
mod error;
mod events;
pub mod state;
mod utils;

use app::*;
#[allow(unused_imports)]
use error::*;
#[allow(unused_imports)]
use events::*;
use state::*;

#[program]
pub mod dawn {
    use super::*;

    // ---- bootstrap (one-shot) ----------------------------------------------
    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        DawnApp::initialize_config(ctx)
    }

    pub fn update_config_authority(
        ctx: Context<UpdateConfigAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        DawnApp::update_config_authority(ctx, new_authority)
    }

    // ---- access domain ------------------------------------------------------
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

    // ---- domain authority (Tier-2 grants) -----------------------------------
    pub fn grant_domain_authority_for_access_domain(
        ctx: Context<GrantDomainAuthorityForAccessDomain>,
        role: DomainAuthorityRole,
        authority: Pubkey,
        label: Option<String>,
        expires_at: Option<i64>,
    ) -> Result<()> {
        DawnApp::grant_domain_authority_for_access_domain(
            ctx,
            role,
            authority,
            label,
            expires_at,
        )
    }

    pub fn revoke_domain_authority_for_access_domain(
        ctx: Context<RevokeDomainAuthorityForAccessDomain>,
    ) -> Result<()> {
        DawnApp::revoke_domain_authority_for_access_domain(ctx)
    }

    // ---- AMF (auth methods + credentials) ----------------------------------
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

    // ---- devices ------------------------------------------------------------
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

    // ---- local domain (management plane) -----------------------------------
    pub fn update_local_domain_status(
        ctx: Context<UpdateLocalDomainStatus>,
        new_status: u8,
    ) -> Result<()> {
        DawnApp::update_local_domain_status(ctx, new_status)
    }
}
