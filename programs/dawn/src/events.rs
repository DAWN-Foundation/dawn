use anchor_lang::prelude::*;

#[event]
pub struct BuildingAdded {
    pub building: Pubkey,
    pub owner: Pubkey,
    pub name: String,
    pub address: String,
    pub floors: u8,
}

#[event]
pub struct PlanAdded {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub building: Pubkey,
    pub price: u64,
    pub duration: u16,
    pub speed: u32,
    pub capacity: u64,
    pub sla_id: u64,
}

#[event]
pub struct PlanRemoved {
    pub plan: Pubkey,
    pub building: Pubkey,
}

#[event]
pub struct Subscribed {
    pub subscription: Pubkey,
    pub subscriber: Pubkey,
    pub plan: Pubkey,
    pub expiration: i64,
    pub swap_price: u128,
}
