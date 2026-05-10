use anchor_lang::prelude::*;

use crate::{
    error::DawnError,
    events::AccessDomainControlPlaneUpdated,
    state::AccessDomain,
    utils::hash_string_seed,
    DawnApp,
};

/// Rotate (or set) the control_plane_device on an existing AccessDomain.
/// Signer must equal `access_domain.owner` (cold operator key).
#[derive(Accounts)]
pub struct SetControlPlaneDevice<'info> {
    #[account(mut, address = access_domain.owner @ DawnError::OnlyAccessDomainOwner)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [
            AccessDomain::SEED_PREFIX,
            access_domain.owner.as_ref(),
            &hash_string_seed(&access_domain.name),
        ],
        bump = access_domain.bump,
    )]
    pub access_domain: Account<'info, AccessDomain>,
}

impl DawnApp {
    pub fn set_control_plane_device(
        ctx: Context<SetControlPlaneDevice>,
        new_control_plane_device: Pubkey,
    ) -> Result<()> {
        require!(
            new_control_plane_device != Pubkey::default(),
            DawnError::InvalidControlPlaneDevice
        );

        let access_domain = &mut ctx.accounts.access_domain;
        let previous = access_domain.control_plane_device;
        access_domain.control_plane_device = new_control_plane_device;

        emit!(AccessDomainControlPlaneUpdated {
            access_domain: access_domain.key(),
            previous,
            new: new_control_plane_device,
            updated_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
