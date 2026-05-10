use anchor_lang::prelude::*;

use super::assert_infrastructure_authority;
use crate::{
    error::DawnError,
    events::AuthenticatorRevoked,
    state::{AccessDomain, AccessDomainAuthenticator, DomainAuthority},
    utils::hash_string_seed,
    DawnApp,
};

/// Close an AccessDomainAuthenticator account. Rent is refunded to the
/// caller. The on-chain record is gone; the SoT-bridge picks up the
/// `AuthenticatorRevoked` event and drops the AP from its cache.
///
/// Authorized identically to `register_authenticator`.
#[derive(Accounts)]
pub struct RevokeAuthenticator<'info> {
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

    pub infrastructure_registrar: Option<Account<'info, DomainAuthority>>,

    #[account(
        mut,
        constraint = authenticator.access_domain == access_domain.key()
            @ DawnError::AuthenticatorAccessDomainMismatch,
        seeds = [
            AccessDomainAuthenticator::SEED_PREFIX,
            access_domain.key().as_ref(),
            &authenticator.mac_address,
        ],
        bump = authenticator.bump,
        close = caller,
    )]
    pub authenticator: Account<'info, AccessDomainAuthenticator>,
}

impl DawnApp {
    pub fn revoke_authenticator(ctx: Context<RevokeAuthenticator>) -> Result<()> {
        let now = assert_infrastructure_authority(
            &ctx.accounts.caller.key(),
            &ctx.accounts.access_domain,
            ctx.accounts.infrastructure_registrar.as_ref(),
        )?;

        let a = &ctx.accounts.authenticator;
        emit!(AuthenticatorRevoked {
            authenticator: a.key(),
            access_domain: a.access_domain,
            mac_address: a.mac_address,
            last_pubkey: a.current_pubkey,
            revoked_by: ctx.accounts.caller.key(),
            revoked_at: now,
        });
        Ok(())
    }
}
