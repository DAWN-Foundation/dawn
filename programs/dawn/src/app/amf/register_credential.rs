use anchor_lang::prelude::*;

use crate::{
    app::{amf::register_credential_helper, DawnApp},
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
        register_credential_helper::process_register_credential(
            &ctx.accounts.plan,
            &ctx.accounts.subscription,
            &ctx.accounts.auth_method,
            ctx.accounts.caller.key(),
            &mut ctx.accounts.credential,
            credential_data,
            ctx.bumps.credential,
        )
    }
}
