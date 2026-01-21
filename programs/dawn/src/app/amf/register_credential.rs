use anchor_lang::prelude::*;

use crate::{
    app::DawnApp,
    error::DawnError,
    events::CredentialRegistered,
    state::{AuthMethod, Credential, Plan, Subscription},
    utils::{hash_parameters, hash_string_seed, optional_pubkey_seed},
};

/// Context for registering client credentials
#[derive(Accounts)]
#[instruction(credential_data: [u8; 128])]
pub struct RegisterCredential<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        seeds = [
            AuthMethod::SEED_PREFIX,
            auth_method.authority.as_ref(),
            &auth_method.method_type.as_seed(),
            auth_method.device.as_ref(),
            &auth_method.encryption_key,
            &hash_parameters(&auth_method.parameters),
        ],
        bump = auth_method.bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        mut,
        seeds = [
            Plan::SEED_PREFIX.as_ref(),
            plan.local_domain.as_ref(),
            &optional_pubkey_seed(plan.parent_plan),
            &hash_string_seed(&plan.name),
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
            Subscription::SEED_PREFIX,
            plan.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(
        init,
        payer = caller,
        space = Credential::SIZE,
        seeds = [
            Credential::SEED_PREFIX.as_ref(),
            subscription.key().as_ref(),
            plan.key().as_ref(),
            auth_method.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump
    )]
    pub credential: Account<'info, Credential>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Register client credentials for an auth method
    pub fn register_credential(
        ctx: Context<RegisterCredential>,
        credential_data: [u8; 128],
    ) -> Result<()> {
        let current_time = Clock::get()?.unix_timestamp;
        let plan = &ctx.accounts.plan;
        let subscription = &ctx.accounts.subscription;
        let auth_method = &ctx.accounts.auth_method;

        // Validate subscription is not expired
        require!(
            subscription.expiration > current_time,
            DawnError::SubscriptionExpired
        );

        // Validate auth method is assigned to the plan
        require!(
            plan.auth_methods.contains(&auth_method.key()),
            DawnError::AuthMethodNotInPlan
        );

        let credential = &mut ctx.accounts.credential;

        credential.created_at = current_time;
        credential.authority = ctx.accounts.caller.key();
        credential.plan = plan.key();
        credential.subscription = subscription.key();
        credential.auth_method = auth_method.key();
        credential.credential_data = credential_data;
        credential.bump = ctx.bumps.credential;

        emit!(CredentialRegistered {
            credential: credential.key(),
            authority: credential.authority,
            plan: credential.plan,
            subscription: credential.subscription,
            auth_method: credential.auth_method,
            credential_data: credential.credential_data,
            created_at: credential.created_at,
        });

        Ok(())
    }
}
