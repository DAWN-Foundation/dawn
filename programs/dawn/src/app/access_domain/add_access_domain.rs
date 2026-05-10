use anchor_lang::prelude::*;

use crate::{
    error::DawnError,
    events::AccessDomainAdded,
    state::AccessDomain,
    utils::hash_string_seed,
    DawnApp,
};

/// Context for creating a top-level AccessDomain.
///
/// PDA seeds: ["access_domain", caller, hash(name)]
///
/// `control_plane_device` MUST be provided (it's the wallet that decrypts
/// per-customer credential payloads). `gateway_device`, `local_domain`,
/// and `external_uuid` are optional and may be null at creation time;
/// the operator can set or change them later via dedicated instructions.
#[derive(Accounts)]
#[instruction(name: String)]
pub struct AddAccessDomain<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        init,
        payer = caller,
        space = AccessDomain::SIZE,
        seeds = [
            AccessDomain::SEED_PREFIX,
            caller.key().as_ref(),
            &hash_string_seed(&name),
        ],
        bump,
    )]
    pub access_domain: Account<'info, AccessDomain>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn add_access_domain(
        ctx: Context<AddAccessDomain>,
        name: String,
        control_plane_device: Pubkey,
        gateway_device: Option<Pubkey>,
        local_domain: Option<Pubkey>,
        external_uuid: Option<[u8; 16]>,
    ) -> Result<()> {
        let trimmed = name.trim();
        require!(!trimmed.is_empty(), DawnError::EmptyAccessDomainName);
        require!(trimmed.len() <= 32, DawnError::AccessDomainNameTooLong);
        require!(
            control_plane_device != Pubkey::default(),
            DawnError::InvalidControlPlaneDevice
        );

        let now = Clock::get()?.unix_timestamp;
        let access_domain = &mut ctx.accounts.access_domain;
        access_domain.created_at = now;
        access_domain.owner = ctx.accounts.caller.key();
        access_domain.control_plane_device = control_plane_device;
        access_domain.gateway_device = gateway_device;
        access_domain.local_domain = local_domain;
        access_domain.external_uuid = external_uuid;
        access_domain.name = trimmed.to_string();
        access_domain.bump = ctx.bumps.access_domain;

        emit!(AccessDomainAdded {
            access_domain: access_domain.key(),
            owner: access_domain.owner,
            control_plane_device: access_domain.control_plane_device,
            gateway_device: access_domain.gateway_device,
            local_domain: access_domain.local_domain,
            external_uuid: access_domain.external_uuid,
            name: access_domain.name.clone(),
            created_at: now,
        });
        Ok(())
    }
}
