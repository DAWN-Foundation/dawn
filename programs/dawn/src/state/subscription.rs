use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// The subscription account, representing a subscription to a plan
#[account]
#[derive(InitSpace)]
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
    /// PDA bump seed
    pub bump: u8,
}

impl Subscription {
    pub const SEED_PREFIX: &'static [u8] = b"subscription";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;

    /// Initialize subscription data
    pub fn init(
        &mut self,
        plan: Pubkey,
        subscriber: Pubkey,
        device: Option<Pubkey>,
        bump: u8,
        current_timestamp: i64,
        expiration: i64,
    ) {
        self.created_at = current_timestamp;
        self.plan = plan;
        self.subscriber = subscriber;
        self.device = device;
        self.expiration = expiration;
        self.last_claim = current_timestamp;
        self.claimable_dawn = 0;
        self.bump = bump;
    }
}
