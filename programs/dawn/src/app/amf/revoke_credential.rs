use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};

use crate::{
    app::DawnApp,
    events::CredentialRevoked,
    state::{AuthMethod, Credential},
};

/// Context for revoking client credentials
#[derive(Accounts)]
pub struct RevokeCredential<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = auth_method.authority == caller.key(),
        seeds = [
            AuthMethod::SEED_PREFIX.as_ref(),
            auth_method.authority.as_ref(),
            &auth_method.method_type.as_seed(),
            &auth_method.parameters[..MAX_SEED_LEN]
        ],
        bump = auth_method.bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        mut,
        seeds = [
            Credential::SEED_PREFIX.as_ref(),
            auth_method.key().as_ref(),
            credential.client.as_ref(),
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
