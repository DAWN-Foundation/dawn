use anchor_lang::prelude::*;

use crate::state::DeviceType;

#[event]
pub struct TokenConfigInitialized {
    pub token_config: Pubkey,
    pub dawn_mint: Pubkey,
    pub created_at: i64,
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
pub struct ServiceAgreementAdded {
    pub service_agreement: Pubkey,
    pub threshold: u64,
    pub payout_ratio: u64,
    pub created_at: i64,
}

#[event]
pub struct PlanAdded {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub local_domain: Pubkey,
    pub access_domain: Option<Pubkey>,
    pub distribution_domain: Option<Pubkey>,
    pub parent_plan: Option<Pubkey>,
    pub name: String,
    pub price: u64,
    pub duration: u16,
    pub speed: u32,
    pub capacity: u64,
    pub start_at: i64,
    pub service_agreement: Pubkey,
    pub auth_methods: Vec<Pubkey>,
    pub created_at: i64,
}

#[event]
pub struct AuthMethodAdded {
    pub auth_method: Pubkey,
    pub plan: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct Subscribed {
    pub subscription: Pubkey,
    pub plan: Pubkey,
    pub subscriber: Pubkey,
    pub device: Option<Pubkey>,
    pub expiration: i64,
    pub last_claim: i64,
    pub claimable_dawn: u64,
    pub daily_usdc: u64,
    pub swap_price: u128,
    pub created_at: i64,
}

#[event]
pub struct SubscriptionExtended {
    pub subscription: Pubkey,
    pub plan: Pubkey,
    pub subscriber: Pubkey,
    pub device: Option<Pubkey>,
    pub expiration: i64,
    pub swap_price: u128,
    pub created_at: i64,
}

#[event]
pub struct Claimed {
    pub subscription: Pubkey,
    pub plan: Pubkey,
    pub swap_price: u128,
    pub dawn_claimed: u64,
    pub claimed_at: i64,
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
    pub local_domain: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct DistributionDomainAdded {
    pub distribution_domain: Pubkey,
    pub owner: Pubkey,
    pub local_domain: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct IpBlockAdded {
    pub ip_block: Pubkey,
    pub tier: u8,
    pub root_block_index: u32,
    pub block_base: u32,
    pub block_cidr: u8,
    pub unit_capacity: u16,
    pub free_units: u16,
    pub created_at: i64,
}

#[event]
pub struct IpBlockFull {
    pub ip_block: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct IpBlockNonFull {
    pub ip_block: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RootIpBlockFull {
    pub root_ip_block: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RootIpBlockNonFull {
    pub root_ip_block: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct IpLeased {
    pub ip_lease: Pubkey,
    pub subscription: Option<Pubkey>,
    pub device: Pubkey,
    pub tier: u8,
    pub ipv4: [u8; 4],
    pub cidr: u8,
    pub unit_index: u32,
    pub block_index: u32,
    pub leased_at: i64,
}

#[event]
pub struct IpRevoked {
    pub ip_lease: Pubkey,
    pub device: Pubkey,
    pub ipv4: [u8; 4],
    pub block_index: u32,
    pub revoked_at: i64,
}

#[event]
pub struct IpRegistryInitialized {
    pub ip_registry: Pubkey,
    pub tier: u8,
    pub authority: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct RootIpBlockInitialized {
    pub root_ip_block: Pubkey,
    pub tier: u8,
    pub root_block_index: u32,
    pub authority: Pubkey,
    pub base_ipv4: u32,
    pub base_cidr: u8,
    pub block_cidr: u8,
    pub created_at: i64,
}

#[event]
pub struct AuthMethodRegistered {
    pub auth_method: Pubkey,
    pub method_type: u8,
    pub device: Pubkey,
    pub encryption_key: [u8; 32],
    pub parameters: [u8; 256],
    pub created_at: i64,
}

#[event]
pub struct CredentialRegistered {
    pub credential: Pubkey,
    pub authority: Pubkey,
    pub plan: Pubkey,
    pub subscription: Pubkey,
    pub auth_method: Pubkey,
    pub credential_data: [u8; 128],
    pub created_at: i64,
}

#[event]
pub struct CredentialRevoked {
    pub credential: Pubkey,
    pub auth_method: Pubkey,
    pub revoked_at: i64,
}

#[event]
pub struct ConnectionRegistered {
    pub connection: Pubkey,
    pub auth_method: Pubkey,
    pub entity_a: Pubkey,
    pub entity_b: Pubkey,
    pub credential_data_a: [u8; 64],
    pub credential_data_b: [u8; 64],
    pub created_at: i64,
}

#[event]
pub struct ConnectionRevoked {
    pub connection: Pubkey,
    pub auth_method: Pubkey,
    pub revoked_at: i64,
}
