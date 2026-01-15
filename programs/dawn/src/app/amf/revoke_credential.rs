use anchor_lang::prelude::*;

use crate::{
    app::DawnApp,
    events::CredentialRevoked,
    state::{AuthMethod, Credential},
    utils::hash_parameters,
};

/// Context for revoking client credentials
#[derive(Accounts)]
pub struct RevokeCredential<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

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
        let auth_method = &ctx.accounts.auth_method;

        emit!(CredentialRevoked {
            credential: credential.key(),
            auth_method: auth_method.key(),
            revoked_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
