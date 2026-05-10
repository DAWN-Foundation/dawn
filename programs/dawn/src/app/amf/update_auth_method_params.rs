use anchor_lang::prelude::*;

use crate::{
    app::amf::register_auth_method::validate_auth_params,
    error::DawnError,
    events::AuthMethodParamsUpdated,
    state::{AccessDomain, AuthMethod, DomainAuthority, DomainAuthorityRole},
    utils::hash_string_seed,
    DawnApp,
};

/// Update the parameters of an existing AuthMethod in place.
///
/// Same PDA as the original `register_auth_method` — no migration needed
/// for Credentials, plans, or anything else that references the
/// AuthMethod by pubkey.
///
/// Two authorization regimes:
///   - `caller == access_domain.owner` (cold operator key) — always works
///   - `caller` is the authority on a live `DomainAuthority` PDA for this
///     AccessDomain with `role == ConfigPlaneManager` and not expired
#[derive(Accounts)]
pub struct UpdateAuthMethodParams<'info> {
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
        mut,
        constraint = auth_method.access_domain == access_domain.key()
            @ DawnError::AuthMethodAccessDomainMismatch,
        seeds = [
            AuthMethod::SEED_PREFIX,
            access_domain.key().as_ref(),
            auth_method.method_type.as_seed(),
        ],
        bump = auth_method.bump,
    )]
    pub auth_method: Account<'info, AuthMethod>,

    /// Optional ConfigPlaneManager grant. When provided AND caller is
    /// not the owner, the program checks role + expiry.
    pub config_plane_manager: Option<Account<'info, DomainAuthority>>,
}

impl DawnApp {
    pub fn update_auth_method_params(
        ctx: Context<UpdateAuthMethodParams>,
        new_parameters: [u8; 256],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        // Authorization: owner OR ConfigPlaneManager grant.
        if ctx.accounts.caller.key() != ctx.accounts.access_domain.owner {
            let cpm = ctx
                .accounts
                .config_plane_manager
                .as_ref()
                .ok_or(error!(DawnError::OnlyOwnerOrConfigPlaneManager))?;
            require!(
                cpm.domain == ctx.accounts.access_domain.key(),
                DawnError::DomainAuthorityDomainMismatch
            );
            require!(
                cpm.role == DomainAuthorityRole::ConfigPlaneManager,
                DawnError::DomainAuthorityWrongRole
            );
            require!(
                ctx.accounts.caller.key() == cpm.authority,
                DawnError::DomainAuthoritySignerMismatch
            );
            if let Some(exp) = cpm.expires_at {
                require!(exp > now, DawnError::DomainAuthorityExpired);
            }
        }

        // Re-validate the new params for this method type before persisting.
        let method_type = ctx.accounts.auth_method.method_type;
        validate_auth_params(method_type, &new_parameters)?;

        let auth_method = &mut ctx.accounts.auth_method;
        auth_method.parameters = new_parameters;

        emit!(AuthMethodParamsUpdated {
            auth_method: auth_method.key(),
            access_domain: auth_method.access_domain,
            method_type: auth_method.method_type as u8,
            updated_by: ctx.accounts.caller.key(),
            updated_at: now,
        });
        Ok(())
    }
}
