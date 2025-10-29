use anchor_lang::prelude::*;

use crate::{
    events::{DistributionDomainAdded, PlanAdded},
    state::{DistributionDomain, LocalDomain, Plan, ServiceAgreement},
    utils::{hash_bytes_seed, hash_string_seed, optional_pubkey_seed},
    DawnApp, DawnError,
};

/// Context for adding an L3 plan (original plan with distribution domain)
#[derive(Accounts)]
#[instruction(
    name: String,
    price: u64,
    duration: u16,
    speed: u32,
    capacity: u64,
    start_at: Option<i64>,
)]
pub struct AddL3Plan<'info> {
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

    /// The plan account
    #[account(
        init,
        payer = caller,
        space = Plan::SIZE,
        seeds = [
            Plan::SEED_PREFIX.as_ref(),
            local_domain.key().as_ref(),
            &optional_pubkey_seed(None::<Pubkey>),
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

    /// The distribution domain account (for L3 plans)
    #[account(
        init,
        payer = caller,
        space = DistributionDomain::SIZE,
        seeds = [
            DistributionDomain::SEED_PREFIX.as_ref(),
            plan.key().as_ref(),
            local_domain.key().as_ref(),
        ],
        bump,
    )]
    pub distribution_domain: Account<'info, DistributionDomain>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Add an L3 plan (original plan with distribution domain)
    #[allow(clippy::too_many_arguments)]
    pub fn add_l3_plan(
        ctx: Context<AddL3Plan>,
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
        let now = Clock::get()?.unix_timestamp;

        // Initialize Distribution Domain for L3 plan
        let distribution_domain = &mut ctx.accounts.distribution_domain;
        distribution_domain.created_at = now;
        distribution_domain.owner = ctx.accounts.caller.key();
        distribution_domain.local_domain = ctx.accounts.local_domain.key();
        distribution_domain.bump = ctx.bumps.distribution_domain;

        emit!(DistributionDomainAdded {
            distribution_domain: distribution_domain.key(),
            owner: distribution_domain.owner,
            local_domain: distribution_domain.local_domain,
            created_at: distribution_domain.created_at,
        });

        // Set plan fields for L3 plan
        plan.created_at = now;
        plan.owner = ctx.accounts.caller.key();
        plan.local_domain = ctx.accounts.local_domain.key();
        plan.distribution_domain = Some(distribution_domain.key());
        plan.access_domain = None;
        plan.parent_plan = None;
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

    /// Validate basic plan parameters
    pub fn validate_plan_params(
        name: &str,
        price: u64,
        duration: u16,
        speed: u32,
        start_at: Option<i64>,
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

        // Validate start time
        if let Some(start_at) = start_at {
            let now = Clock::get()?.unix_timestamp;
            let six_months_later = now + 6 * 30 * 24 * 60 * 60;

            // Make sure the start time is not in the past
            require!(start_at > now, DawnError::InvalidStartTime);

            // Make sure the start time is not more than 6 months in the future
            require!(start_at <= six_months_later, DawnError::InvalidStartTime);
        }

        Ok(())
    }
}
