use anchor_lang::prelude::*;

use crate::{
    utils::optional_pubkey_seed, AccessDomain, DawnApp, DawnError, Device, PlanAdded, Subscription,
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
    pub access_domain: Pubkey,
    /// Associated Device
    pub device: Pubkey,
    /// Whether the plan is a resale plan
    pub is_resale: bool,
    /// The parent plan (for resale)
    pub parent_plan: Pubkey,
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
    /// PDA bump seed
    pub bump: u8,
}

const PLAN_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // owner
    + 32 // access_domain
    + 32 // device
    + 1 // is_resale
    + 32 // parent plan
    + 8 // price
    + 2 // duration
    + 4 // speed
    + 8 // capacity
    + 8 // start_at
    + 32 // service_agreement
    + 1; // bump

#[derive(Accounts)]
#[instruction(price: u64, duration: u16, speed: u32, capacity: u64, start_at: Option<i64>)]
pub struct AddPlan<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The access domain account
    #[account(
        mut,
        seeds = [b"access_domain", access_domain.device.as_ref()],
        bump = access_domain.bump
    )]
    pub access_domain: Account<'info, AccessDomain>,

    /// The device account (must be owned by the caller)
    #[account(
        mut,
        constraint = device.owner == caller.key(),
        seeds = [
            b"device",
            device.owner.as_ref(),
            device.model.as_ref(),
            &device.mac_address,
        ],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,

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
            parent_plan.access_domain.as_ref(),
            parent_plan.device.as_ref(),
            &optional_pubkey_seed(parent_plan.is_resale.then_some(parent_plan.parent_plan)),
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
            access_domain.key().as_ref(),
            device.key().as_ref(),
            &optional_pubkey_seed(parent_plan.as_ref().map(|p| p.key())),
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
    pub fn add_plan(
        ctx: Context<AddPlan>,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        start_at: Option<i64>,
    ) -> Result<()> {
        // Make sure the plan price is not zero
        require!(price > 0, DawnError::ZeroPlanPrice);

        // Make sure the plan duration is not zero
        require!(duration > 0, DawnError::ZeroPlanDuration);

        // Make sure the plan speed is not zero
        require!(speed > 0, DawnError::ZeroPlanSpeed);

        let (is_resale, parent_plan) = if let Some(parent_plan) = ctx.accounts.parent_plan.as_ref()
        {
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

            (true, parent_plan.key())
        } else {
            (false, Pubkey::new_from_array([0; 32]))
        };

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
        plan.access_domain = ctx.accounts.access_domain.key();
        plan.device = ctx.accounts.device.key();
        plan.is_resale = is_resale;
        plan.parent_plan = parent_plan;
        plan.price = price;
        plan.duration = duration;
        plan.speed = speed;
        plan.capacity = capacity; // 0 for unlimited
        plan.start_at = start_at.unwrap_or(0); // 0 for immediate start
        plan.service_agreement = ctx.accounts.service_agreement.key();
        plan.bump = ctx.bumps.plan;

        emit!(PlanAdded {
            plan: plan.key(),
            owner: plan.owner,
            access_domain: plan.access_domain,
            device: plan.device,
            is_resale: plan.is_resale,
            parent_plan: plan.parent_plan,
            price: plan.price,
            duration: plan.duration,
            speed: plan.speed,
            capacity: plan.capacity,
            start_at: plan.start_at,
            service_agreement: plan.service_agreement,
            created_at: plan.created_at,
        });

        Ok(())
    }
}
