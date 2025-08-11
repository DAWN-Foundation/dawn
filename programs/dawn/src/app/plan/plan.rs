use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use crate::{
    utils::{optional_pubkey_seed, trim_null_bytes},
    AccessDomain, DawnApp, DawnError, DistributionDomain, LocalDomain, PlanAdded, Subscription,
    ACCESS_DOMAIN_SIZE, DISTRIBUTION_DOMAIN_SIZE,
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
    /// Associated Distribution Domain
    pub distribution_domain: Option<Pubkey>,
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
    pub auth_methods: Vec<Pubkey>,
    /// PDA bump seed
    pub bump: u8,
}

const PLAN_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // owner
    + (1 + 32) // optional + access_domain
    + (1 + 32) // optional + distribution_domain
    + 32 // local_domain
    + (1 + 32) // optional + parent_plan
    + (4 + 32) // name
    + 8 // price
    + 2 // duration
    + 4 // speed
    + 8 // capacity
    + 8 // start_at
    + 32 // service_agreement
    + (4 + 2 * 32) // auth_methods (max 2 * 32 bytes)
    + 1; // bump

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
            b"service_agreement", 
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
        space = PLAN_SIZE,
        seeds = [
            b"plan",
            local_domain.key().as_ref(),
            &optional_pubkey_seed(None::<Pubkey>),
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

    /// The local domain account (derived from seeds)
    #[account(
        seeds = [
            b"local_domain",
            caller.key().as_ref(),
            trim_null_bytes(local_domain.name.as_ref()),
        ],
        bump = local_domain.bump,
    )]
    pub local_domain: Account<'info, LocalDomain>,

    /// The distribution domain account (for L3 plans)
    #[account(
        init,
        payer = caller,
        space = DISTRIBUTION_DOMAIN_SIZE,
        seeds = [
            b"distribution_domain",
            plan.key().as_ref(),
            local_domain.key().as_ref(),
        ],
        bump,
    )]
    pub distribution_domain: Account<'info, DistributionDomain>,

    pub system_program: Program<'info, System>,
}

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
            b"service_agreement", 
            &service_agreement.threshold.to_le_bytes(),
            &service_agreement.payout_ratio.to_le_bytes(),
        ],
        bump = service_agreement.bump,
    )]
    pub service_agreement: Account<'info, ServiceAgreement>,

    /// The parent plan account
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
    pub parent_plan: Account<'info, Plan>,

    /// The plan account
    #[account(
        init,
        payer = caller,
        space = PLAN_SIZE,
        seeds = [
            b"plan",
            local_domain.key().as_ref(),
            &optional_pubkey_seed(Some(parent_plan.key())),
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

    /// The subscription account of parent plan
    #[account(
        seeds = [
            b"subscription",
            subscription.plan.as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,

    /// The local domain account (derived from seeds)
    #[account(
        seeds = [
            b"local_domain",
            caller.key().as_ref(),
            trim_null_bytes(local_domain.name.as_ref()),
        ],
        bump = local_domain.bump,
    )]
    pub local_domain: Account<'info, LocalDomain>,

    /// The access domain account (for L2 plans)
    #[account(
        init,
        payer = caller,
        space = ACCESS_DOMAIN_SIZE,
        seeds = [
            b"access_domain", 
            plan.key().as_ref(),
            local_domain.key().as_ref(),
        ],
        bump,
    )]
    pub access_domain: Account<'info, AccessDomain>,

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
        address = auth_method.device,
        constraint = device.local_domain == plan.local_domain @ DawnError::DeviceNotInLocalDomain,
        seeds = [
            b"device",
            device.owner.as_ref(),
            device.model.as_ref(),
            &device.name.as_bytes()[..min(device.name.len(), MAX_SEED_LEN)],
            &device.mac_address,
        ],
        bump = device.bump,
    )]
    pub device: Account<'info, crate::app::Device>,

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

        // Set plan fields for L3 plan
        plan.created_at = now;
        plan.owner = ctx.accounts.caller.key();
        plan.local_domain = ctx.accounts.local_domain.key();
        plan.distribution_domain = Some(distribution_domain.key());
        plan.access_domain = None;
        plan.parent_plan = None;
        plan.name.clone_from(&name);
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

        // Set plan fields for L2 plan
        plan.created_at = now;
        plan.owner = ctx.accounts.caller.key();
        plan.local_domain = ctx.accounts.local_domain.key();
        plan.access_domain = Some(access_domain.key());
        plan.distribution_domain = None;
        plan.parent_plan = Some(parent_plan.key());
        plan.name.clone_from(&name);
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

    /// Add an auth method to a plan
    pub fn add_auth_method(ctx: Context<AddAuthMethod>) -> Result<()> {
        let plan = &mut ctx.accounts.plan;
        let auth_method = &ctx.accounts.auth_method;

        // Check if the auth method is already associated with this plan
        require!(
            !plan.auth_methods.contains(&auth_method.key()),
            DawnError::DuplicateAuthMethods
        );

        // Check if we haven't exceeded the maximum number of auth methods (3)
        require!(plan.auth_methods.len() < 3, DawnError::TooManyAuthMethods);

        // Add the auth method to the plan
        plan.auth_methods.push(auth_method.key());

        Ok(())
    }

    /// Validate basic plan parameters
    fn validate_plan_params(
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

    /// Validate auth methods from remaining accounts
    fn validate_auth_methods(
        remaining_accounts: &[AccountInfo],
        caller: &Pubkey,
    ) -> Result<Vec<Pubkey>> {
        // Check that we don't have more than 2 auth methods
        require!(remaining_accounts.len() <= 2, DawnError::TooManyAuthMethods);

        let mut auth_method_keys = Vec::new();

        for account_info in remaining_accounts.iter() {
            let auth_method_key = account_info.key();

            // Check for duplicate auth methods
            require!(
                !auth_method_keys.contains(&auth_method_key),
                DawnError::DuplicateAuthMethods
            );

            // Get account data
            let data = &account_info.data.borrow();

            require!(!data.is_empty(), DawnError::InvalidAuthMethodAccount);

            // // Validate account is owned by our program
            require!(
                account_info.owner == &crate::ID,
                DawnError::InvalidAuthMethodAccount
            );

            // Deserialize the auth method account using try_from_slice
            let auth_method = crate::app::amf::AuthMethod::try_from_slice(&data[8..])
                .map_err(|_| DawnError::InvalidAuthMethodAccount)?;

            // Verify the authority matches the caller
            require!(
                auth_method.authority == *caller,
                DawnError::InvalidAuthMethodAuthority
            );
            auth_method_keys.push(auth_method_key);
        }

        Ok(auth_method_keys)
    }
}
