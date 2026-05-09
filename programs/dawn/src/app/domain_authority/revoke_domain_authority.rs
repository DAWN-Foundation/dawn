use anchor_lang::prelude::*;

use crate::{
    error::DawnError,
    events::DomainAuthorityRevoked,
    state::{AccessDomain, DomainAuthority},
    utils::hash_string_seed,
    DawnApp,
};

/// Revoke an existing DomainAuthority. Closes the PDA, refunds rent to caller.
/// Caller must equal `access_domain.owner`.
#[derive(Accounts)]
pub struct RevokeDomainAuthorityForAccessDomain<'info> {
    #[account(mut, address = access_domain.owner @ DawnError::OnlyAccessDomainOwner)]
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
        mut,
        constraint = domain_authority.domain == access_domain.key()
            @ DawnError::DomainAuthorityDomainMismatch,
        seeds = [
            DomainAuthority::SEED_PREFIX,
            access_domain.key().as_ref(),
            domain_authority.role.as_seed(),
            domain_authority.authority.as_ref(),
        ],
        bump = domain_authority.bump,
        close = caller,
    )]
    pub domain_authority: Account<'info, DomainAuthority>,
}

impl DawnApp {
    pub fn revoke_domain_authority_for_access_domain(
        ctx: Context<RevokeDomainAuthorityForAccessDomain>,
    ) -> Result<()> {
        let da = &ctx.accounts.domain_authority;
        emit!(DomainAuthorityRevoked {
            domain_authority: da.key(),
            domain: da.domain,
            authority: da.authority,
            role: da.role as u8,
            revoked_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
