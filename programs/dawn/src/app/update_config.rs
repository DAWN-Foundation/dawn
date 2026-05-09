use anchor_lang::prelude::*;

use crate::{
    error::DawnError, events::ConfigAuthorityUpdated, state::Config, DawnApp,
};

/// Rotate the cold-admin authority on the protocol Config singleton.
/// Signer must be the current authority.
#[derive(Accounts)]
pub struct UpdateConfigAuthority<'info> {
    #[account(mut, address = config.authority @ DawnError::Unauthorized)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
}

impl DawnApp {
    pub fn update_config_authority(
        ctx: Context<UpdateConfigAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        require!(new_authority != Pubkey::default(), DawnError::Unauthorized);
        let config = &mut ctx.accounts.config;
        let previous = config.authority;
        config.authority = new_authority;
        emit!(ConfigAuthorityUpdated {
            config: config.key(),
            previous,
            new: new_authority,
            updated_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
