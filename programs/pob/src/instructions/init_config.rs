use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::state::Config;

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The SPL token mint to use for staking (immutable after init)
    pub stake_mint: Account<'info, Mint>,

    /// The config account
    #[account(
        init,
        payer = authority,
        space = Config::SIZE,
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitConfig>,
    round_close_grace_slots: u64,
    prover_stake_amount: u64,
    challenger_stake_amount: u64,
    unstake_cooldown_slots: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    // Set the caller as authority
    config.authority = ctx.accounts.authority.key();
    // Store the stake mint (immutable after init)
    config.stake_mint = ctx.accounts.stake_mint.key();
    config.round_close_grace_slots = round_close_grace_slots;
    config.prover_stake_amount = prover_stake_amount;
    config.challenger_stake_amount = challenger_stake_amount;
    config.unstake_cooldown_slots = unstake_cooldown_slots;
    config.bump = ctx.bumps.config;

    Ok(())
}
