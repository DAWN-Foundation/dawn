use anchor_lang::prelude::*;

use crate::DeviceType;

#[event]
pub struct PlanAdded {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub device: Pubkey,
    pub price: u64,
    pub duration: u16,
    pub speed: u32,
    pub capacity: u64,
    pub sla_id: u64,
}

#[event]
pub struct PlanRemoved {
    pub plan: Pubkey,
    pub device: Pubkey,
}

#[event]
pub struct Subscribed {
    pub subscription: Pubkey,
    pub subscriber: Pubkey,
    pub plan: Pubkey,
    pub expiration: i64,
    pub swap_price: u128,
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
}

#[event]
pub struct DeviceAdded {
    pub owner: Pubkey,
    pub device: Pubkey,
    pub model: Pubkey,
    pub longitude: u64,
    pub latitude: u64,
}
