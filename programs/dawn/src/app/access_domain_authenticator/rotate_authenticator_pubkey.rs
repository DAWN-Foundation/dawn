use anchor_lang::prelude::*;

use super::assert_infrastructure_authority;
use crate::{
    error::DawnError,
    events::AuthenticatorRotated,
    state::{AccessDomain, AccessDomainAuthenticator, DomainAuthority},
    utils::hash_string_seed,
    DawnApp,
};

/// Replace an authenticator's `current_pubkey` in place. The PDA
/// address stays put (it's seeded on `mac_address`, which is
/// immutable), so historical references continue to resolve.
///
/// Authorized identically to `register_authenticator`.
#[derive(Accounts)]
pub struct RotateAuthenticatorPubkey<'info> {
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
    )]
    pub authenticator: Account<'info, AccessDomainAuthenticator>,
}

impl DawnApp {
    pub fn rotate_authenticator_pubkey(
        ctx: Context<RotateAuthenticatorPubkey>,
        new_pubkey: Pubkey,
    ) -> Result<()> {
        require!(
            new_pubkey != Pubkey::default(),
            DawnError::InvalidAuthenticatorPubkey
        );
        require!(
            new_pubkey != ctx.accounts.authenticator.current_pubkey,
            DawnError::AuthenticatorRotationNoOp
        );

        let now = assert_infrastructure_authority(
            &ctx.accounts.caller.key(),
            &ctx.accounts.access_domain,
            ctx.accounts.infrastructure_registrar.as_ref(),
        )?;

        let a = &mut ctx.accounts.authenticator;
        let old_pubkey = a.current_pubkey;
        a.current_pubkey = new_pubkey;
        a.key_rotated_at = now;

        emit!(AuthenticatorRotated {
            authenticator: a.key(),
            access_domain: a.access_domain,
            mac_address: a.mac_address,
            old_pubkey,
            new_pubkey,
            rotated_by: ctx.accounts.caller.key(),
            rotated_at: now,
        });
        Ok(())
    }
}
