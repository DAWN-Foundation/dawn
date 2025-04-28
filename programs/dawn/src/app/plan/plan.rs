use anchor_lang::prelude::*;
use solana_program::pubkey::MAX_SEED_LEN;
use std::cmp::min;

use crate::{
    utils::optional_pubkey_seed, AccessDomain, AuthMethodType, DawnApp, DawnError, Device,
    PlanAdded, Subscription,
};

use super::ServiceAgreement;

/// The plan account, representing a subscription plan tied to a device
#[account]
pub struct Plan {
    /// The creation timestamp
    pub created_at: i64,
    /// The plan owner
    pub owner: Pubkey,
    /// Associated Access Domain
    pub access_domain: Option<Pubkey>,
    /// Associated Device
    pub device: Pubkey,
    /// The parent plan (for resale)
    pub parent_plan: Option<Pubkey>,
    /// The plan name (arbitrary string up to 32 bytes)
    pub name: String,
    /// The plan price per `duration` days (in USDC with 6 decimals)
    pub price: u64,
    /// The plan duration in days
    pub duration: u16,
    /// The plan provided speed in Mbps (megabits per second)
    pub speed: u32,
    /// The plan provided data capacity in MB (megabytes)
    /// per `duration` days, 0 for unlimited
    pub capacity: u64,
    /// The start time of the plan (0 for immediate start)
    pub start_at: i64,
    /// The Service Level Agreement Account
    pub service_agreement: Pubkey,
    /// The authentication methods for the plan (max 2)
    pub auth_methods: Vec<AuthMethodType>,
    /// PDA bump seed
    pub bump: u8,
}

const PLAN_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // owner
    + (1 + 32) // optional + access_domain
    + 32 // device
    + (1 + 32) // optional + parent_plan
    + (4 + 32) // name
    + 8 // price
    + 2 // duration
    + 4 // speed
    + 8 // capacity
    + 8 // start_at
    + 32 // service_agreement
    + (4 + 2) // auth_methods
    + 1; // bump

#[derive(Accounts)]
#[instruction(
    name: String,
    price: u64,
    duration: u16,
    speed: u32,
    capacity: u64,
    start_at: Option<i64>,
    auth_methods: Vec<AuthMethodType>,
)]
pub struct AddPlan<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The device account (must be owned by the caller)
    #[account(
        mut,
        constraint = device.owner == caller.key(),
        seeds = [
            b"device",
            device.owner.as_ref(),
            device.model.as_ref(),
            &device.name.as_bytes()[..min(device.name.len(), MAX_SEED_LEN)],
            &device.mac_address,
        ],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,

    /// The access domain account (only provided if device is a Router)
    #[account(
        mut,
        seeds = [b"access_domain", device.key().as_ref()],
        bump = access_domain.bump
    )]
    pub access_domain: Option<Account<'info, AccessDomain>>,

    /// The service agreement account
    #[account(
        seeds = [
            b"service_agreement", 
            &service_agreement.threshold.to_le_bytes(),
            &service_agreement.payout_ratio.to_le_bytes(),
        ],
        bump = service_agreement.bump,
    )]
    pub service_agreement: Account<'info, ServiceAgreement>,

    /// The parent plan account (if exists)
    #[account(
        seeds = [
            b"plan",
            &optional_pubkey_seed(parent_plan.access_domain),
            parent_plan.device.as_ref(),
            &optional_pubkey_seed(parent_plan.parent_plan),
            &parent_plan.name.as_bytes()[..min(parent_plan.name.len(), MAX_SEED_LEN)],
            &parent_plan.price.to_le_bytes(),
            &parent_plan.duration.to_le_bytes(),
            &parent_plan.speed.to_le_bytes(),
            &parent_plan.capacity.to_le_bytes(),
            &parent_plan.start_at.to_le_bytes(),
            parent_plan.service_agreement.as_ref(),
        ],
        bump = parent_plan.bump,
    )]
    pub parent_plan: Option<Account<'info, Plan>>,

    /// The plan account
    #[account(
        init,
        payer = caller,
        space = PLAN_SIZE,
        seeds = [
            b"plan",
            &optional_pubkey_seed(access_domain.as_ref().map(|a| a.key()))[..],
            device.key().as_ref(),
            &optional_pubkey_seed(parent_plan.as_ref().map(|p| p.key())),
            &name.trim().as_bytes()[..min(name.trim().len(), MAX_SEED_LEN)],
            &price.to_le_bytes(),
            &duration.to_le_bytes(),
            &speed.to_le_bytes(),
            &capacity.to_le_bytes(),
            &start_at.unwrap_or(0).to_le_bytes(),
            service_agreement.key().as_ref(),
        ],
        bump
    )]
    pub plan: Account<'info, Plan>,

    /// The subscription account of parent plan (if exists)
    #[account(
        seeds = [
            b"subscription",
            subscription.plan.as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump,
    )]
    pub subscription: Option<Account<'info, Subscription>>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    #[allow(clippy::too_many_arguments)]
    pub fn add_plan(
        ctx: Context<AddPlan>,
        name: String,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        start_at: Option<i64>,
        auth_methods: Vec<AuthMethodType>,
    ) -> Result<()> {
        // Make sure the plan name is not empty
        require!(!name.is_empty(), DawnError::EmptyPlanName);

        // Make sure the plan name is not too long
        require!(name.len() <= 32, DawnError::PlanNameTooLong);

        // Make sure the plan price is not zero
        require!(price > 0, DawnError::ZeroPlanPrice);

        // Make sure the plan duration is not zero
        require!(duration > 0, DawnError::ZeroPlanDuration);

        // Make sure the plan speed is not zero
        require!(speed > 0, DawnError::ZeroPlanSpeed);

        // Make sure the auth methods are valid
        // No duplicate auth methods
        let mut seen = [false; 6]; // Assuming AuthMethod is an enum with 6 variants
        let mut count = 0;
        for method in &auth_methods {
            let idx = method.to_owned() as usize;
            require!(!seen[idx], DawnError::DuplicateAuthMethods);
            seen[idx] = true;
            count += 1;
        }

        // No more than 2 auth methods (check before moving auth_methods)
        require!(count <= 2, DawnError::TooManyAuthMethods);

        if let Some(parent_plan) = ctx.accounts.parent_plan.as_ref() {
            // for a resale plan, make sure the parent plan has a subscription
            require!(
                ctx.accounts.subscription.is_some(),
                DawnError::ParentPlanNeedSubscription
            );

            // make sure the resold plan is within parent plan
            require!(
                duration <= parent_plan.duration,
                DawnError::OutsideParentBounds,
            );
            require!(speed <= parent_plan.speed, DawnError::OutsideParentBounds);
            require!(
                capacity <= parent_plan.capacity,
                DawnError::OutsideParentBounds
            );
        }

        if let Some(start_at) = &start_at {
            let now = Clock::get()?.unix_timestamp;
            let six_months_later = now + 6 * 30 * 24 * 60 * 60;

            // Make sure the start time is not in the past
            require!(start_at > &now, DawnError::InvalidStartTime);

            // Make sure the start time is not more than 6 months in the future
            require!(start_at <= &six_months_later, DawnError::InvalidStartTime);
        }

        let plan = &mut ctx.accounts.plan;

        plan.created_at = Clock::get()?.unix_timestamp;
        plan.owner = ctx.accounts.caller.key();
        plan.access_domain = ctx.accounts.access_domain.as_ref().map(|a| a.key());
        plan.device = ctx.accounts.device.key();
        plan.parent_plan = ctx.accounts.parent_plan.as_ref().map(|p| p.key());
        plan.name.clone_from(&name);
        plan.price = price;
        plan.duration = duration;
        plan.speed = speed;
        plan.capacity = capacity; // 0 for unlimited
        plan.start_at = start_at.unwrap_or(0); // 0 for immediate start
        plan.service_agreement = ctx.accounts.service_agreement.key();
        plan.auth_methods.clone_from(&auth_methods);
        plan.bump = ctx.bumps.plan;

        emit!(PlanAdded {
            plan: plan.key(),
            owner: plan.owner,
            access_domain: plan.access_domain,
            device: plan.device,
            parent_plan: plan.parent_plan,
            name,
            price: plan.price,
            duration: plan.duration,
            speed: plan.speed,
            capacity: plan.capacity,
            start_at: plan.start_at,
            service_agreement: plan.service_agreement,
            auth_methods,
            created_at: plan.created_at,
        });

        Ok(())
    }
}
