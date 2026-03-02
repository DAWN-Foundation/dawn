use anchor_lang::prelude::*;

use crate::{
    app::DawnApp,
    events::CredentialRevoked,
    state::{AuthMethod, Credential, Plan, Subscription},
    utils::{hash_parameters, hash_string_seed, optional_pubkey_seed},
};

/// Context for revoking client credentials
#[derive(Accounts)]
pub struct RevokeCredential<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [
            Subscription::SEED_PREFIX.as_ref(),
            plan.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(
        mut,
        seeds = [
            Plan::SEED_PREFIX.as_ref(),
            plan.owner.as_ref(),
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
        mut,
        seeds = [
            AuthMethod::SEED_PREFIX.as_ref(),
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
        constraint = credential.authority == caller.key(),
        seeds = [
            Credential::SEED_PREFIX.as_ref(),
            subscription.key().as_ref(),
            plan.key().as_ref(),
            auth_method.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump = credential.bump,
        close = caller
    )]
    pub credential: Account<'info, Credential>,
}

impl DawnApp {
    /// Revoke client credentials by closing the account
    pub fn revoke_credential(ctx: Context<RevokeCredential>) -> Result<()> {
        // Account will be automatically closed due to the `close = authority` constraint
        let credential = &ctx.accounts.credential;
        let subscription = &ctx.accounts.subscription;
        let plan = &ctx.accounts.plan;
        let auth_method = &ctx.accounts.auth_method;

        emit!(CredentialRevoked {
            credential: credential.key(),
            subscription: subscription.key(),
            plan: plan.key(),
            auth_method: auth_method.key(),
            revoked_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
