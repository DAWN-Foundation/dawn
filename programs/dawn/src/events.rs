use anchor_lang::prelude::*;

use crate::{AuthMethodType, DeviceType};

#[event]
pub struct SiteAdded {
    pub site: Pubkey,
    pub owner: Pubkey,
    pub name: String,
    pub created_at: i64,
}

#[event]
pub struct DeviceAssignedToSite {
    pub device: Pubkey,
    pub site: Pubkey,
    pub created_at: i64,
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
    pub access_domain: Option<Pubkey>,
    pub device: Pubkey,
    pub parent_plan: Option<Pubkey>,
    pub name: String,
    pub price: u64,
    pub duration: u16,
    pub speed: u32,
    pub capacity: u64,
    pub start_at: i64,
    pub service_agreement: Pubkey,
    pub auth_methods: Vec<AuthMethodType>,
    pub created_at: i64,
}

#[event]
pub struct PlanRemoved {
    pub plan: Pubkey,
    pub device: Pubkey,
}

#[event]
pub struct Subscribed {
    pub subscription: Pubkey,
    pub plan: Pubkey,
    pub subscriber: Pubkey,
    pub device: Option<Pubkey>,
    pub expiration: i64,
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
    pub owner: Pubkey,
    pub device: Pubkey,
    pub site: Option<Pubkey>,
    pub model: Pubkey,
    pub organization: Pubkey,
    pub name: String,
    pub longitude: i64,
    pub latitude: i64,
    pub height: u16,
    pub placement: [i32; 2],
    pub mac_address: [u8; 6],
    pub created_at: i64,
}

#[event]
pub struct DeviceLocationVerified {
    pub device: Pubkey,
    pub latitude: i64,
    pub longitude: i64,
    pub verified_at: i64,
}

// #[event]
// pub struct IpPoolAdded {
//     pub ip_pool: Pubkey,
//     pub ip_v4: [u8; 4],
//     pub ip_v4_cidr_mask: u8,
//     pub ip_v6: [u16; 16],
//     pub ip_v6_cidr_mask: u8,
//     pub created_at: i64,
// }

// #[event]
// pub struct IpLeased {
//     pub ip_lease: Pubkey,
//     pub ip_pool: Pubkey,
//     pub device: Pubkey,
//     pub ip_v4: [u8; 4],
//     pub ip_v4_cidr_mask: u8,
//     pub ip_v6: [u16; 16],
//     pub ip_v6_cidr_mask: u8,
//     pub created_at: i64,
// }
