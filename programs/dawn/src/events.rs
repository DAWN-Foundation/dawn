use anchor_lang::prelude::*;

use crate::state::DeviceType;

#[event]
pub struct ConfigInitialized {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct ConfigAuthorityUpdated {
    pub config: Pubkey,
    pub previous: Pubkey,
    pub new: Pubkey,
    pub updated_at: i64,
}

#[event]
pub struct DeviceLocationAdded {
    pub device_location: Pubkey,
    pub device: Pubkey,
    pub height: u16,
    pub longitude: i64,
    pub latitude: i64,
    pub placement: [i32; 2],
    pub created_at: i64,
}

#[event]
pub struct DeviceLocationVerified {
    pub device_location: Pubkey,
    pub device: Pubkey,
    pub verified_at: i64,
}

#[event]
pub struct DeviceModelAdded {
    pub device_model: Pubkey,
    pub device_type: DeviceType,
    pub manufacturer: String,
    pub model: String,
    pub created_at: i64,
}

#[event]
pub struct DeviceAdded {
    pub device: Pubkey,
    pub device_location: Pubkey,
    pub owner: Pubkey,
    pub model: Pubkey,
    pub local_domain: Pubkey,
    pub name: String,
    pub mac_address: [u8; 6],
    pub created_at: i64,
}

#[event]
pub struct LocalDomainAdded {
    pub local_domain: Pubkey,
    pub owner: Pubkey,
    pub name: String,
    pub created_at: i64,
}

#[event]
pub struct AccessDomainAdded {
    pub access_domain: Pubkey,
    pub owner: Pubkey,
    pub control_plane_device: Pubkey,
    pub gateway_device: Option<Pubkey>,
    pub local_domain: Option<Pubkey>,
    pub external_uuid: Option<[u8; 16]>,
    pub name: String,
    pub created_at: i64,
}

#[event]
pub struct AccessDomainControlPlaneUpdated {
    pub access_domain: Pubkey,
    pub previous: Pubkey,
    pub new: Pubkey,
    pub updated_at: i64,
}

#[event]
pub struct AccessDomainGatewayUpdated {
    pub access_domain: Pubkey,
    pub previous: Option<Pubkey>,
    pub new: Option<Pubkey>,
    pub updated_at: i64,
}

#[event]
pub struct AuthMethodRegistered {
    pub auth_method: Pubkey,
    pub access_domain: Pubkey,
    pub method_type: u8,
    pub parameters: [u8; 256],
    pub created_at: i64,
}

#[event]
pub struct AuthMethodParamsUpdated {
    pub auth_method: Pubkey,
    pub access_domain: Pubkey,
    pub method_type: u8,
    pub updated_by: Pubkey,
    pub updated_at: i64,
}

#[event]
pub struct CredentialRegistered {
    pub credential: Pubkey,
    pub authority: Pubkey,
    pub access_domain: Pubkey,
    pub auth_method: Pubkey,
    pub vlan_id: Option<u16>,
    pub qos_tag: Option<u8>,
    pub created_at: i64,
}

#[event]
pub struct CredentialRevoked {
    pub credential: Pubkey,
    pub authority: Pubkey,
    pub access_domain: Pubkey,
    pub auth_method: Pubkey,
    pub revoked_at: i64,
}

#[event]
pub struct DomainAuthorityGranted {
    pub domain_authority: Pubkey,
    pub domain: Pubkey,
    pub authority: Pubkey,
    pub role: u8,
    pub label: Option<String>,
    pub expires_at: Option<i64>,
    pub created_by: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct DomainAuthorityRevoked {
    pub domain_authority: Pubkey,
    pub domain: Pubkey,
    pub authority: Pubkey,
    pub role: u8,
    pub revoked_at: i64,
}
