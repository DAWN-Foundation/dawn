use anchor_lang::prelude::*;

use crate::{
    app::DawnApp,
    error::DawnError,
    events::CredentialRegistered,
    state::{AccessDomain, AuthMethod, Credential, Plan, Subscription},
    utils::hash_string_seed,
};

/// Customer self-mint path for plan-attached credentials.
///
/// This is the "subscriber pays for a Plan and signs to mint their own
/// Credential" flow. Authorization is the Subscription itself: holding
/// a valid Subscription that points at a Plan attached to this
/// AccessDomain authorizes the subscriber to mint a Credential.
///
/// PDA seeds for the Credential:
///   ["credential", access_domain, auth_method, caller(=beneficiary)]
///
/// `Credential.subscription` and `Credential.plan` are populated as
/// `Some(...)` because the plan-attached path always carries the
/// commercial context. For the BSS-direct path (no Subscription), use
/// `register_credential_for` with a Registrar grant.
///
/// `sealed_payload[128]` is sealed off-chain to
/// `access_domain.control_plane_device.owner` (the AAA appliance's
/// wallet); the program treats it as opaque ciphertext. See
/// `docs/sot-bridge-protocol.md` §6 for the wire format.
#[derive(Accounts)]
#[instruction(
    vlan_id: Option<u16>,
    qos_tag: Option<u8>,
    sealed_payload: [u8; 128],
)]
pub struct RegisterCredential<'info> {
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

    /// The Plan being subscribed to. Must reference this AccessDomain.
    #[account(
        constraint = plan.access_domain == Some(access_domain.key())
            @ DawnError::PlanAccessDomainMismatch,
    )]
    pub plan: Account<'info, Plan>,

    /// The caller's Subscription on the Plan. Authorizes the mint.
    #[account(
        constraint = subscription.subscriber == caller.key()
            @ DawnError::InvalidBeneficiary,
        seeds = [
            Subscription::SEED_PREFIX,
            plan.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(
        init,
        payer = caller,
        space = Credential::SIZE,
        seeds = [
            Credential::SEED_PREFIX.as_ref(),
            access_domain.key().as_ref(),
            auth_method.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump,
    )]
    pub credential: Account<'info, Credential>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn register_credential(
        ctx: Context<RegisterCredential>,
        vlan_id: Option<u16>,
        qos_tag: Option<u8>,
        sealed_payload: [u8; 128],
    ) -> Result<()> {
        if let Some(v) = vlan_id {
            require!(v >= 1 && v <= 4094, DawnError::InvalidVlanId);
        }

        let now = Clock::get()?.unix_timestamp;
        let credential = &mut ctx.accounts.credential;
        credential.created_at = now;
        credential.authority = ctx.accounts.caller.key();
        credential.access_domain = ctx.accounts.access_domain.key();
        credential.auth_method = ctx.accounts.auth_method.key();
        credential.subscription = Some(ctx.accounts.subscription.key());
        credential.plan = Some(ctx.accounts.plan.key());
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
            created_by: ctx.accounts.caller.key(),
            created_at: now,
        });
        Ok(())
    }
}
