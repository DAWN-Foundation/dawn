use anchor_lang::prelude::*;

use crate::{
    events::PlanAdded,
    state::{AccessDomain, LocalDomain, ServiceAgreement},
    utils::{hash_string_seed, optional_pubkey_seed},
    DawnApp, DawnError, Plan,
};

/// Context for adding an L2 plan (derived/reseller plan attached to an
/// existing AccessDomain).
///
/// Schema migration note: prior versions of this instruction created a
/// new `AccessDomain` account as a side effect (PDA seeded on
/// `(plan, local_domain)`). The access-domain redesign decouples the
/// two: AccessDomains are first-class operator-owned identities created
/// via the standalone `add_access_domain` instruction. An L2 plan now
/// REFERENCES an existing AccessDomain by passing it as an account.
///
/// Plan.access_domain is set to `Some(access_domain.key())` for the
/// commercial linkage. Customers subscribing to this Plan inherit
/// access to that AccessDomain through their Subscription + Credential.
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

    /// The parent plan account (optional, for resale)
    pub parent_plan: Option<Account<'info, Plan>>,

    /// The plan account (init)
    #[account(
        init,
        payer = caller,
        space = Plan::SIZE,
        seeds = [
            Plan::SEED_PREFIX.as_ref(),
            caller.key().as_ref(),
            local_domain.key().as_ref(),
            &optional_pubkey_seed(parent_plan.as_ref().map(|acc| acc.key())),
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
            &hash_string_seed(&local_domain.name),
        ],
        bump = local_domain.bump,
    )]
    pub local_domain: Account<'info, LocalDomain>,

    /// The AccessDomain this plan attaches to. Must already exist
    /// (created via `add_access_domain`). Caller must be its owner.
    #[account(
        constraint = access_domain.owner == caller.key()
            @ DawnError::OnlyAccessDomainOwner,
        seeds = [
            AccessDomain::SEED_PREFIX,
            access_domain.owner.as_ref(),
            &hash_string_seed(&access_domain.name),
        ],
        bump = access_domain.bump,
    )]
    pub access_domain: Account<'info, AccessDomain>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Add an L2 plan (derived plan attached to an existing AccessDomain)
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
        Self::validate_plan_params(&name, price, duration, speed, start_at)?;

        let plan = &mut ctx.accounts.plan;
        let parent_plan = &ctx.accounts.parent_plan;
        let now = Clock::get()?.unix_timestamp;

        if let Some(parent_plan) = &parent_plan {
            // Validate that the resold plan is within parent plan bounds
            require!(
                duration <= parent_plan.duration,
                DawnError::OutsideParentBounds,
            );
            require!(speed <= parent_plan.speed, DawnError::OutsideParentBounds);
            if parent_plan.capacity > 0 {
                require!(capacity > 0, DawnError::OutsideParentBounds);
                require!(
                    capacity <= parent_plan.capacity,
                    DawnError::OutsideParentBounds
                );
            }
        }

        // Set plan fields for L2 plan
        plan.created_at = now;
        plan.owner = ctx.accounts.caller.key();
        plan.local_domain = ctx.accounts.local_domain.key();
        plan.access_domain = Some(ctx.accounts.access_domain.key());
        plan.distribution_domain = None;
        plan.parent_plan = parent_plan.as_ref().map(|acc| acc.key());
        plan.name = name.trim().to_string();
        plan.price = price;
        plan.duration = duration;
        plan.speed = speed;
        plan.capacity = capacity;
        plan.start_at = start_at.unwrap_or(0);
        plan.service_agreement = ctx.accounts.service_agreement.key();
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
            created_at: plan.created_at,
        });

        Ok(())
    }
}
