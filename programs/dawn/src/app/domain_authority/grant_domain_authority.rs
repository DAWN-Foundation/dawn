use anchor_lang::prelude::*;

use crate::{
    error::DawnError,
    events::DomainAuthorityGranted,
    state::{AccessDomain, DomainAuthority, DomainAuthorityRole},
    utils::hash_string_seed,
    DawnApp,
};

/// Grant a Tier-2 role (e.g. Registrar) on an AccessDomain to a delegated key.
///
/// v1 ships with one role variant (Registrar) which is AccessDomain-only,
/// so this ix is typed on AccessDomain. When future role variants need
/// to apply to DistributionDomain, we'll add a parallel ix typed on
/// DistributionDomain.
///
/// PDA seeds: ["domain_authority", access_domain, role_byte, authority]
///
/// Caller must equal `access_domain.owner` (the cold operator key).
#[derive(Accounts)]
#[instruction(role: DomainAuthorityRole, authority: Pubkey)]
pub struct GrantDomainAuthorityForAccessDomain<'info> {
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
        init,
        payer = caller,
        space = DomainAuthority::SIZE,
        seeds = [
            DomainAuthority::SEED_PREFIX,
            access_domain.key().as_ref(),
            role.as_seed(),
            authority.as_ref(),
        ],
        bump,
    )]
    pub domain_authority: Account<'info, DomainAuthority>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn grant_domain_authority_for_access_domain(
        ctx: Context<GrantDomainAuthorityForAccessDomain>,
        role: DomainAuthorityRole,
        authority: Pubkey,
        label: Option<String>,
        expires_at: Option<i64>,
    ) -> Result<()> {
        require!(
            authority != Pubkey::default(),
            DawnError::InvalidDomainAuthority
        );

        // Label length cap (matches #[max_len(32)] on the struct).
        if let Some(l) = &label {
            require!(l.len() <= 32, DawnError::DomainAuthorityLabelTooLong);
        }

        // Reject already-expired grants.
        if let Some(exp) = expires_at {
            let now = Clock::get()?.unix_timestamp;
            require!(exp > now, DawnError::DomainAuthorityAlreadyExpired);
        }

        let now = Clock::get()?.unix_timestamp;
        let da = &mut ctx.accounts.domain_authority;
        da.created_at = now;
        da.domain = ctx.accounts.access_domain.key();
        da.authority = authority;
        da.role = role;
        da.created_by = ctx.accounts.caller.key();
        da.label = label.clone();
        da.expires_at = expires_at;
        da.bump = ctx.bumps.domain_authority;

        emit!(DomainAuthorityGranted {
            domain_authority: da.key(),
            domain: da.domain,
            authority: da.authority,
            role: role as u8,
            label,
            expires_at,
            created_by: da.created_by,
            created_at: now,
        });
        Ok(())
    }
}
