use anchor_lang::prelude::*;

use crate::{
    app::DawnApp,
    error::DawnError,
    events::CredentialRevoked,
    state::{AccessDomain, AuthMethod, Credential},
    utils::hash_string_seed,
};

/// Close a Credential. Two authorized signers:
///   - the credential's `authority` (the customer themselves)
///   - the access_domain owner (operator-driven cleanup)
#[derive(Accounts)]
pub struct RevokeCredential<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        seeds = [
            AccessDomain::SEED_PREFIX,
            access_domain.owner.as_ref(),
            &hash_string_seed(&access_domain.name),
        ],
        bump = access_domain.bump,
    )]
    pub access_domain: Account<'info, AccessDomain>,

    #[account(
        seeds = [
            AuthMethod::SEED_PREFIX,
            auth_method.access_domain.as_ref(),
            auth_method.method_type.as_seed(),
        ],
        bump = auth_method.bump,
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        mut,
        constraint = (
            credential.authority == caller.key()
            || access_domain.owner == caller.key()
        ) @ DawnError::UnauthorizedCredentialRevoke,
        constraint = credential.access_domain == access_domain.key()
            @ DawnError::CredentialAccessDomainMismatch,
        constraint = credential.auth_method == auth_method.key()
            @ DawnError::CredentialAuthMethodMismatch,
        seeds = [
            Credential::SEED_PREFIX.as_ref(),
            access_domain.key().as_ref(),
            auth_method.key().as_ref(),
            credential.authority.as_ref(),
        ],
        bump = credential.bump,
        close = caller,
    )]
    pub credential: Account<'info, Credential>,
}

impl DawnApp {
    pub fn revoke_credential(ctx: Context<RevokeCredential>) -> Result<()> {
        emit!(CredentialRevoked {
            credential: ctx.accounts.credential.key(),
            authority: ctx.accounts.credential.authority,
            access_domain: ctx.accounts.access_domain.key(),
            auth_method: ctx.accounts.auth_method.key(),
            revoked_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
