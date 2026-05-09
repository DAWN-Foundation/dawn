use anchor_lang::prelude::*;

use crate::{
    app::amf::psk_method::PSKMethodParams,
    error::DawnError,
    events::AuthMethodRegistered,
    state::{AccessDomain, AuthMethod, AuthMethodType},
    utils::hash_string_seed,
    DawnApp,
};

/// Context for registering THE authentication method of a given type on
/// an AccessDomain. At most one AuthMethod per (access_domain, method_type).
///
/// PDA seeds: ["auth_method", access_domain, method_type_byte]
///
/// To change params later (e.g. drop a band, rotate the rotation
/// interval), call `update_auth_method_params` — same PDA, mutated in
/// place.
///
/// Caller must equal `access_domain.owner`. (We don't yet support
/// delegating registration to a Tier-2 role; that would be a future
/// `AuthMethodManager` variant.)
#[derive(Accounts)]
#[instruction(method_type: AuthMethodType, parameters: [u8; 256])]
pub struct RegisterAuthMethod<'info> {
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
        space = AuthMethod::SIZE,
        seeds = [
            AuthMethod::SEED_PREFIX,
            access_domain.key().as_ref(),
            method_type.as_seed(),
        ],
        bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn register_auth_method(
        ctx: Context<RegisterAuthMethod>,
        method_type: AuthMethodType,
        parameters: [u8; 256],
    ) -> Result<()> {
        validate_auth_params(method_type, &parameters)?;

        let now = Clock::get()?.unix_timestamp;
        let auth_method = &mut ctx.accounts.auth_method;
        auth_method.created_at = now;
        auth_method.authority = ctx.accounts.caller.key();
        auth_method.access_domain = ctx.accounts.access_domain.key();
        auth_method.method_type = method_type;
        auth_method.parameters = parameters;
        auth_method.bump = ctx.bumps.auth_method;

        emit!(AuthMethodRegistered {
            auth_method: auth_method.key(),
            access_domain: auth_method.access_domain,
            method_type: auth_method.method_type as u8,
            parameters: auth_method.parameters,
            created_at: now,
        });
        Ok(())
    }
}

pub fn validate_auth_params(method_type: AuthMethodType, parameters: &[u8; 256]) -> Result<()> {
    match method_type {
        AuthMethodType::Psk | AuthMethodType::Mpsk => {
            let params = PSKMethodParams::try_from_slice(&parameters[..PSKMethodParams::SIZE])
                .map_err(|_| error!(DawnError::InvalidAuthMethodType))?;
            params.validate()?;
        }
    }
    Ok(())
}
