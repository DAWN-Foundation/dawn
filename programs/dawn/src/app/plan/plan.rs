use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use crate::{
    utils::optional_pubkey_seed, AuthMethodType, DawnApp, DawnError, LocalDomain, PlanAdded,
    Subscription,
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
    /// Associated Local Domain
    pub local_domain: Pubkey,
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
    /// The authentication method accounts associated with this plan (max 10)
    pub auth_method_accounts: Vec<Pubkey>,
    /// PDA bump seed
    pub bump: u8,
}

const PLAN_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // owner
    + (1 + 32) // optional + access_domain
    + 32 // local_domain
    + (1 + 32) // optional + parent_plan
    + (4 + 32) // name
    + 8 // price
    + 2 // duration
    + 4 // speed
    + 8 // capacity
    + 8 // start_at
    + 32 // service_agreement
    + (4 + 2) // auth_methods
    + (4 + 10 * 32) // auth_method_accounts (max 10 * 32 bytes)
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
    local_domain_name: String,
)]
pub struct AddPlan<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

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
            parent_plan.local_domain.as_ref(),
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
            local_domain.key().as_ref(),
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

    /// The local domain account (derived from seeds)
    #[account(
        seeds = [
            b"local_domain",
            caller.key().as_ref(),
            &local_domain_name.trim().as_bytes()[..min(local_domain_name.trim().len(), MAX_SEED_LEN)]
        ],
        bump = local_domain.bump
    )]
    pub local_domain: Account<'info, LocalDomain>,

    pub system_program: Program<'info, System>,
}

/// Context for adding an auth method to a plan
#[derive(Accounts)]
pub struct AddAuthMethod<'info> {
    #[account(mut, constraint = caller.key() == plan.owner)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"plan",
            plan.local_domain.as_ref(),
            &optional_pubkey_seed(plan.parent_plan),
            &plan.name.as_bytes()[..min(plan.name.len(), MAX_SEED_LEN)],
            &plan.price.to_le_bytes(),
            &plan.duration.to_le_bytes(),
            &plan.speed.to_le_bytes(),
            &plan.capacity.to_le_bytes(),
            &plan.start_at.to_le_bytes(),
            plan.service_agreement.as_ref(),
        ],
        bump = plan.bump,
    )]
    pub plan: Account<'info, Plan>,

    #[account(
        seeds = [
            b"auth_method",
            auth_method.authority.as_ref(),
            &auth_method.method_type.as_seed(),
            &auth_method.parameters[..MAX_SEED_LEN],
        ],
        bump = auth_method.bump
    )]
    pub auth_method: Account<'info, crate::app::amf::AuthMethod>,
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
        local_domain_name: String,
    ) -> Result<()> {
        // Make sure the local domain name is not empty or too long
        require!(
            !local_domain_name.is_empty(),
            DawnError::EmptyLocalDomainName
        );
        require!(
            local_domain_name.len() <= 32,
            DawnError::LocalDomainNameTooLong
        );

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
        plan.local_domain = ctx.accounts.local_domain.key();
        plan.parent_plan = ctx.accounts.parent_plan.as_ref().map(|p| p.key());
        plan.name.clone_from(&name);
        plan.price = price;
        plan.duration = duration;
        plan.speed = speed;
        plan.capacity = capacity; // 0 for unlimited
        plan.start_at = start_at.unwrap_or(0); // 0 for immediate start
        plan.service_agreement = ctx.accounts.service_agreement.key();
        plan.auth_methods.clone_from(&auth_methods);
        plan.auth_method_accounts = Vec::new(); // Initialize empty, will be populated later
        plan.bump = ctx.bumps.plan;

        emit!(PlanAdded {
            plan: plan.key(),
            owner: plan.owner,
            local_domain: plan.local_domain,
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

    /// Add an auth method to a plan
    pub fn add_auth_method(
        ctx: Context<AddAuthMethod>,
    ) -> Result<()> {
        let plan = &mut ctx.accounts.plan;
        let auth_method = &ctx.accounts.auth_method;

        // Check if the auth method type is already in the plan's auth_methods
        require!(
            plan.auth_methods.contains(&auth_method.method_type),
            DawnError::InvalidAuthMethodType
        );

        // Check if the auth method is already associated with this plan
        require!(
            !plan.auth_method_accounts.contains(&auth_method.key()),
            DawnError::DuplicateAuthMethods
        );

        // Check if we haven't exceeded the maximum number of auth methods (10)
        require!(
            plan.auth_method_accounts.len() < 10,
            DawnError::TooManyAuthMethods
        );

        // Add the auth method to the plan
        plan.auth_method_accounts.push(auth_method.key());

        Ok(())
    }
}
