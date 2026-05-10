use anchor_lang::prelude::*;

use super::assert_infrastructure_authority;
use crate::{
    error::DawnError,
    events::AuthenticatorRegistered,
    state::{AccessDomain, AccessDomainAuthenticator, DomainAuthority},
    utils::hash_string_seed,
    DawnApp,
};

/// Register a new AP (Access Point) authenticator on an AccessDomain.
///
/// PDA seeds: ["authenticator", access_domain, mac_address]
///
/// Authorized by either the AccessDomain owner (direct, cold-admin
/// path) or the holder of a live `DomainAuthority{InfrastructureRegistrar}`
/// grant on this AccessDomain.
#[derive(Accounts)]
#[instruction(
    mac_address: [u8; 6],
    initial_pubkey: Pubkey,
)]
pub struct RegisterAuthenticator<'info> {
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

    /// Optional InfrastructureRegistrar grant. When provided, caller
    /// must equal `grant.authority`. When omitted, caller must equal
    /// `access_domain.owner`. Mirrors the `register_credential_for`
    /// Anchor Optional<Account> convention — pass the program id as
    /// the placeholder pubkey for None.
    pub infrastructure_registrar: Option<Account<'info, DomainAuthority>>,

    #[account(
        init,
        payer = caller,
        space = AccessDomainAuthenticator::SIZE,
        seeds = [
            AccessDomainAuthenticator::SEED_PREFIX,
            access_domain.key().as_ref(),
            &mac_address,
        ],
        bump,
    )]
    pub authenticator: Account<'info, AccessDomainAuthenticator>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn register_authenticator(
        ctx: Context<RegisterAuthenticator>,
        mac_address: [u8; 6],
        initial_pubkey: Pubkey,
        device: Option<Pubkey>,
        label: Option<String>,
        expires_at: Option<i64>,
    ) -> Result<()> {
        // Input validation.
        require!(
            initial_pubkey != Pubkey::default(),
            DawnError::InvalidAuthenticatorPubkey
        );
        require!(
            mac_address != [0u8; 6],
            DawnError::InvalidAuthenticatorMac
        );
        if let Some(l) = &label {
            require!(l.len() <= 32, DawnError::AuthenticatorLabelTooLong);
        }

        // Authorization — also returns `now` for the timestamp writes.
        let now = assert_infrastructure_authority(
            &ctx.accounts.caller.key(),
            &ctx.accounts.access_domain,
            ctx.accounts.infrastructure_registrar.as_ref(),
        )?;

        // Reject already-expired grants.
        if let Some(exp) = expires_at {
            require!(exp > now, DawnError::AuthenticatorAlreadyExpired);
        }

        let a = &mut ctx.accounts.authenticator;
        a.created_at = now;
        a.access_domain = ctx.accounts.access_domain.key();
        a.mac_address = mac_address;
        a.current_pubkey = initial_pubkey;
        a.key_rotated_at = now;
        a.device = device;
        a.label = label.clone();
        a.expires_at = expires_at;
        a.bump = ctx.bumps.authenticator;

        emit!(AuthenticatorRegistered {
            authenticator: a.key(),
            access_domain: a.access_domain,
            mac_address,
            initial_pubkey,
            device,
            label,
            expires_at,
            registered_by: ctx.accounts.caller.key(),
            created_at: now,
        });
        Ok(())
    }
}
