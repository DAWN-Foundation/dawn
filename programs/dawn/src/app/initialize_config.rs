use anchor_lang::prelude::*;

use crate::{events::ConfigInitialized, state::Config, DawnApp};

/// One-time protocol initialization. Creates the Config singleton with
/// the caller as the cold-admin authority.
///
/// PDA seeds: ["config"]
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        init,
        payer = caller,
        space = Config::SIZE,
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let config = &mut ctx.accounts.config;
        config.created_at = now;
        config.authority = ctx.accounts.caller.key();
        config.bump = ctx.bumps.config;

        emit!(ConfigInitialized {
            config: config.key(),
            authority: config.authority,
            created_at: now,
        });
        Ok(())
    }
}
