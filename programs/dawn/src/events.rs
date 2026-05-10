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
    /// The signer who registered this AuthMethod. Equals
    /// `access_domain.owner` for direct mints; future delegation
    /// patterns may allow other roles.
    pub created_by: Pubkey,
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
    /// The signer who minted this credential. For direct mints this
    /// equals `access_domain.owner`; for Registrar-mediated mints this
    /// equals the live `DomainAuthority{Registrar}.authority` (the
    /// operator-api hot wallet). Lets downstream consumers correlate
    /// credentials with the registrar that produced them without an
    /// extra per-tx fetch.
    pub created_by: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct CredentialRevoked {
    pub credential: Pubkey,
    pub authority: Pubkey,
    pub access_domain: Pubkey,
    pub auth_method: Pubkey,
    /// The signer who closed this credential. Either
    /// `access_domain.owner` (operator-driven cleanup) or the
    /// credential's own `authority` (customer-driven self-revoke).
    pub revoked_by: Pubkey,
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
    /// The signer who revoked this grant. Equals `domain.owner`.
    pub revoked_by: Pubkey,
    pub revoked_at: i64,
}

#[event]
pub struct AuthenticatorRegistered {
    pub authenticator: Pubkey,
    pub access_domain: Pubkey,
    pub mac_address: [u8; 6],
    pub initial_pubkey: Pubkey,
    pub device: Option<Pubkey>,
    pub label: Option<String>,
    pub expires_at: Option<i64>,
    /// The signer who registered the authenticator. Either
    /// `access_domain.owner` (cold-admin direct) or the live
    /// `DomainAuthority{InfrastructureRegistrar}.authority`.
    pub registered_by: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct AuthenticatorRotated {
    pub authenticator: Pubkey,
    pub access_domain: Pubkey,
    pub mac_address: [u8; 6],
    pub old_pubkey: Pubkey,
    pub new_pubkey: Pubkey,
    /// Same authorization regime as the register event.
    pub rotated_by: Pubkey,
    pub rotated_at: i64,
}

#[event]
pub struct AuthenticatorRevoked {
    pub authenticator: Pubkey,
    pub access_domain: Pubkey,
    pub mac_address: [u8; 6],
    /// The pubkey that was active immediately before revocation.
    /// Useful for the SoT-bridge to drop the right cache entry without
    /// re-reading the account (which is now closed).
    pub last_pubkey: Pubkey,
    pub revoked_by: Pubkey,
    pub revoked_at: i64,
}
