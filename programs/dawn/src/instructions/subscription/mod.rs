use anchor_lang::prelude::*;

use super::{Config, DawnApp, Device, Plan};

mod extend;
mod payment;
mod subscribe;

pub use extend::*;
pub use subscribe::*;

/// The plan account, representing a subscription plan tied to a device
#[account]
pub struct Subscription {
    /// The creation timestamp
    pub created_at: i64,
    /// Associated subscription plan
    pub plan: Pubkey,
    /// The plan subscriber
    pub subscriber: Pubkey,
    /// The device that is subscribed to the plan (optional for mobile subscribers without devices)
    pub device: Option<Pubkey>,
    /// Subscription expiration time (UNIX timestamp in seconds)
    pub expiration: i64,
    /// Last claim timestamp for DAWN tokens
    pub last_claim: i64,
    /// Next claimable amount of DAWN tokens
    pub claimable_dawn: u64,
    /// Daily USDC portion for swaps
    pub daily_usdc: u64,
    /// PDA bump seed
    pub bump: u8,
}

pub const SUBSCRIPTION_SIZE: usize = 8 // id
    + 8 // created_at 
    + 32 // plan
    + 32 // subscriber
    + (1 + 32) // optional + device
    + 8 // expiration
    + 8 // last_claim
    + 8 // claimable_dawn
    + 8 // daily_usdc
    + 1; // bump
