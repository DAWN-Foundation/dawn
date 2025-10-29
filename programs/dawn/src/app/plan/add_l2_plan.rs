use anchor_lang::prelude::*;

use crate::{
    events::{AccessDomainAdded, PlanAdded},
    state::{AccessDomain, LocalDomain, ServiceAgreement},
    utils::{hash_bytes_seed, hash_string_seed, optional_pubkey_seed},
    DawnApp, DawnError, Plan, Subscription,
};

/// Context for adding an L2 plan (derived plan with access domain)
#[derive(Accounts)]
#[instruction(
    name: String,
    price: u64,
    duration: u16,
    speed: u32,
    capacity: u64,
    start_at: Option<i64>,
)]
pub struct AddL2Plan<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The service agreement account
    #[account(
        seeds = [
            ServiceAgreement::SEED_PREFIX.as_ref(),
            &service_agreement.threshold.to_le_bytes(),
            &service_agreement.payout_ratio.to_le_bytes(),
        ],
        bump = service_agreement.bump,
    )]
    pub service_agreement: Account<'info, ServiceAgreement>,

    /// The parent plan account
    #[account(
        seeds = [
            Plan::SEED_PREFIX.as_ref(),
            parent_plan.local_domain.as_ref(),
            &optional_pubkey_seed(parent_plan.parent_plan),
            &hash_string_seed(&parent_plan.name),
            &parent_plan.price.to_le_bytes(),
            &parent_plan.duration.to_le_bytes(),
            &parent_plan.speed.to_le_bytes(),
            &parent_plan.capacity.to_le_bytes(),
            &parent_plan.start_at.to_le_bytes(),
            parent_plan.service_agreement.as_ref(),
        ],
        bump = parent_plan.bump,
    )]
    pub parent_plan: Account<'info, Plan>,

    /// The plan account
    #[account(
        init,
        payer = caller,
        space = Plan::SIZE,
        seeds = [
            Plan::SEED_PREFIX.as_ref(),
            local_domain.key().as_ref(),
            &optional_pubkey_seed(Some(parent_plan.key())),
            &hash_string_seed(&name),
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

    /// The subscription account of parent plan
    #[account(
        seeds = [
            Subscription::SEED_PREFIX.as_ref(),
            subscription.plan.as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,

    /// The local domain account (derived from seeds)
    #[account(
        seeds = [
            LocalDomain::SEED_PREFIX.as_ref(),
            caller.key().as_ref(),
            &hash_bytes_seed(local_domain.name.as_ref())?,
        ],
        bump = local_domain.bump,
    )]
    pub local_domain: Account<'info, LocalDomain>,

    /// The access domain account (for L2 plans)
    #[account(
        init,
        payer = caller,
        space = AccessDomain::SIZE,
        seeds = [
            AccessDomain::SEED_PREFIX.as_ref(),
            plan.key().as_ref(),
            local_domain.key().as_ref(),
        ],
        bump,
    )]
    pub access_domain: Account<'info, AccessDomain>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Add an L2 plan (derived plan with access domain)
    #[allow(clippy::too_many_arguments)]
    pub fn add_l2_plan(
        ctx: Context<AddL2Plan>,
        name: String,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        start_at: Option<i64>,
    ) -> Result<()> {
        // Validate basic plan parameters
        Self::validate_plan_params(&name, price, duration, speed, start_at)?;

        // Validate auth methods from remaining accounts
        let auth_methods =
            Self::validate_auth_methods(&ctx.remaining_accounts, &ctx.accounts.caller.key())?;

        let plan = &mut ctx.accounts.plan;
        let parent_plan = &ctx.accounts.parent_plan;
        let now = Clock::get()?.unix_timestamp;

        // Validate that the resold plan is within parent plan bounds
        require!(
            duration <= parent_plan.duration,
            DawnError::OutsideParentBounds,
        );
        require!(speed <= parent_plan.speed, DawnError::OutsideParentBounds);
        require!(
            capacity <= parent_plan.capacity,
            DawnError::OutsideParentBounds
        );

        // Initialize Access Domain for L2 plan
        let access_domain = &mut ctx.accounts.access_domain;
        access_domain.created_at = now;
        access_domain.owner = ctx.accounts.caller.key();
        access_domain.local_domain = ctx.accounts.local_domain.key();
        access_domain.bump = ctx.bumps.access_domain;

        emit!(AccessDomainAdded {
            access_domain: access_domain.key(),
            owner: access_domain.owner,
            local_domain: access_domain.local_domain,
            created_at: access_domain.created_at,
        });

        // Set plan fields for L2 plan
        plan.created_at = now;
        plan.owner = ctx.accounts.caller.key();
        plan.local_domain = ctx.accounts.local_domain.key();
        plan.access_domain = Some(access_domain.key());
        plan.distribution_domain = None;
        plan.parent_plan = Some(parent_plan.key());
        // Store trimmed name to match PDA seeds
        plan.name = name.trim().to_string();
        plan.price = price;
        plan.duration = duration;
        plan.speed = speed;
        plan.capacity = capacity;
        plan.start_at = start_at.unwrap_or(0);
        plan.service_agreement = ctx.accounts.service_agreement.key();
        plan.auth_methods.clone_from(&auth_methods);
        plan.bump = ctx.bumps.plan;

        emit!(PlanAdded {
            plan: plan.key(),
            owner: plan.owner,
            local_domain: plan.local_domain,
            access_domain: plan.access_domain,
            distribution_domain: plan.distribution_domain,
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
