use anchor_lang::prelude::*;

use crate::{
    error::DawnError,
    events::AccessDomainGatewayUpdated,
    state::AccessDomain,
    utils::hash_string_seed,
    DawnApp,
};

/// Set or clear the gateway_device on an existing AccessDomain.
/// Signer must equal `access_domain.owner`. `new_gateway_device = None`
/// detaches.
#[derive(Accounts)]
pub struct SetAccessDomainGatewayDevice<'info> {
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
    pub fn set_access_domain_gateway_device(
        ctx: Context<SetAccessDomainGatewayDevice>,
        new_gateway_device: Option<Pubkey>,
    ) -> Result<()> {
        let access_domain = &mut ctx.accounts.access_domain;
        let previous = access_domain.gateway_device;
        access_domain.gateway_device = new_gateway_device;

        emit!(AccessDomainGatewayUpdated {
            access_domain: access_domain.key(),
            previous,
            new: new_gateway_device,
            updated_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
