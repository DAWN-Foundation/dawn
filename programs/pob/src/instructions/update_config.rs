use anchor_lang::prelude::*;

use crate::error::PobError;
use crate::state::Config;

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The config account
    #[account(
        mut,
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump,
        constraint = config.authority == authority.key() @ PobError::Unauthorized
    )]
    pub config: Account<'info, Config>,
}

/// Update config parameters.
pub fn handler(
    ctx: Context<UpdateConfig>,
    round_close_grace_slots: u64,
    prover_stake_amount: u64,
    challenger_stake_amount: u64,
    unstake_cooldown_slots: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    config.round_close_grace_slots = round_close_grace_slots;
    config.prover_stake_amount = prover_stake_amount;
    config.challenger_stake_amount = challenger_stake_amount;
    config.unstake_cooldown_slots = unstake_cooldown_slots;

    Ok(())
}
