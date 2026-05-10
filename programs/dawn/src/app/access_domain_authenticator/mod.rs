mod register_authenticator;
mod revoke_authenticator;
mod rotate_authenticator_pubkey;

pub use register_authenticator::*;
pub use revoke_authenticator::*;
pub use rotate_authenticator_pubkey::*;

use anchor_lang::prelude::*;

use crate::{
    error::DawnError,
    state::{AccessDomain, DomainAuthority, DomainAuthorityRole},
};

/// Authorization helper shared by register / rotate / revoke
/// authenticator instructions. Mirrors the
/// `register_credential_for` two-regime pattern:
///
/// * `infrastructure_registrar` is `Some` — caller must equal
///   `grant.authority`, role must be `InfrastructureRegistrar`, grant
///   must reference this AccessDomain, must not be expired.
/// * `infrastructure_registrar` is `None` — caller must equal
///   `access_domain.owner` (cold-admin direct path).
///
/// Returns `now` (unix seconds) on success so the caller doesn't have
/// to refetch `Clock::get()`.
pub fn assert_infrastructure_authority(
    caller: &Pubkey,
    access_domain: &Account<AccessDomain>,
    grant: Option<&Account<DomainAuthority>>,
) -> Result<i64> {
    let now = Clock::get()?.unix_timestamp;
    match grant {
        Some(g) => {
            require!(
                g.domain == access_domain.key(),
                DawnError::DomainAuthorityDomainMismatch
            );
            require!(
                g.role == DomainAuthorityRole::InfrastructureRegistrar,
                DawnError::DomainAuthorityWrongRole
            );
            require!(
                *caller == g.authority,
                DawnError::DomainAuthoritySignerMismatch
            );
            if let Some(exp) = g.expires_at {
                require!(exp > now, DawnError::DomainAuthorityExpired);
            }
        }
        None => {
            require!(
                *caller == access_domain.owner,
                DawnError::OnlyAccessDomainOwner
            );
        }
    }
    Ok(now)
}
