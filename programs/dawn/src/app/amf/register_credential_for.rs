use anchor_lang::prelude::*;

use crate::{
    app::DawnApp,
    error::DawnError,
    events::CredentialRegistered,
    state::{AccessDomain, AuthMethod, Credential, DomainAuthority, DomainAuthorityRole},
    utils::hash_string_seed,
};

/// Canonical entrypoint for creating a Credential on an AccessDomain.
///
/// Two authorization regimes:
///   1. With Registrar: `registrar` is Some — caller must equal
///      `registrar.authority`, the Registrar must reference this
///      AccessDomain, role must be Registrar, must not be expired.
///   2. Direct: `registrar` is None — caller must equal
///      `access_domain.owner` (the cold-admin key).
///
/// PDA seeds for Credential: ["credential", access_domain, auth_method, beneficiary]
#[derive(Accounts)]
#[instruction(
    vlan_id: Option<u16>,
    qos_tag: Option<u8>,
    sealed_payload: [u8; 128],
)]
pub struct RegisterCredentialFor<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: used only as a key for PDA derivation; not deserialized.
    pub beneficiary: AccountInfo<'info>,

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
        constraint = auth_method.access_domain == access_domain.key()
            @ DawnError::AuthMethodAccessDomainMismatch,
        seeds = [
            AuthMethod::SEED_PREFIX,
            auth_method.access_domain.as_ref(),
            auth_method.method_type.as_seed(),
        ],
        bump = auth_method.bump,
    )]
    pub auth_method: Account<'info, AuthMethod>,

    /// Optional Registrar grant. When provided, caller must equal
    /// `registrar.authority` and the Registrar must reference this
    /// AccessDomain.
    pub registrar: Option<Account<'info, DomainAuthority>>,

    #[account(
        init,
        payer = caller,
        space = Credential::SIZE,
        seeds = [
            Credential::SEED_PREFIX.as_ref(),
            access_domain.key().as_ref(),
            auth_method.key().as_ref(),
            beneficiary.key().as_ref(),
        ],
        bump
    )]
    pub credential: Account<'info, Credential>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn register_credential_for(
        ctx: Context<RegisterCredentialFor>,
        vlan_id: Option<u16>,
        qos_tag: Option<u8>,
        sealed_payload: [u8; 128],
    ) -> Result<()> {
        let registrar_opt = ctx.accounts.registrar.as_ref();
        let now = Clock::get()?.unix_timestamp;

        match registrar_opt {
            // With Registrar grant.
            Some(registrar) => {
                require!(
                    registrar.domain == ctx.accounts.access_domain.key(),
                    DawnError::DomainAuthorityDomainMismatch
                );
                require!(
                    registrar.role == DomainAuthorityRole::Registrar,
                    DawnError::DomainAuthorityWrongRole
                );
                require!(
                    ctx.accounts.caller.key() == registrar.authority,
                    DawnError::DomainAuthoritySignerMismatch
                );
                if let Some(exp) = registrar.expires_at {
                    require!(exp > now, DawnError::DomainAuthorityExpired);
                }
            }
            // No Registrar: caller must be the access-domain owner.
            None => {
                require!(
                    ctx.accounts.caller.key() == ctx.accounts.access_domain.owner,
                    DawnError::OnlyAccessDomainOwner
                );
            }
        }

        if let Some(v) = vlan_id {
            require!(v >= 1 && v <= 4094, DawnError::InvalidVlanId);
        }

        let credential = &mut ctx.accounts.credential;
        credential.created_at = now;
        credential.authority = ctx.accounts.beneficiary.key();
        credential.access_domain = ctx.accounts.access_domain.key();
        credential.auth_method = ctx.accounts.auth_method.key();
        credential.subscription = None;
        credential.plan = None;
        credential.vlan_id = vlan_id;
        credential.qos_tag = qos_tag;
        credential.sealed_payload = sealed_payload;
        credential.bump = ctx.bumps.credential;

        emit!(CredentialRegistered {
            credential: credential.key(),
            authority: credential.authority,
            access_domain: credential.access_domain,
            auth_method: credential.auth_method,
            vlan_id,
            qos_tag,
            created_at: now,
        });
        Ok(())
    }
}
