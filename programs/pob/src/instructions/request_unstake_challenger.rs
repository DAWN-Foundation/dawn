use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::error::PobError;
use crate::state::{Challenger, Config, CHALLENGER_VAULT_SEED};

#[derive(Accounts)]
pub struct RequestUnstakeChallenger<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The config account (to validate stake mint)
    #[account(
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// The challenger account - validates authority
    #[account(
        mut,
        seeds = [
            Challenger::SEED_PREFIX.as_ref(),
            challenger.authority.as_ref(),
        ],
        bump = challenger.bump,
        constraint = challenger.authority == authority.key() @ PobError::Unauthorized,
    )]
    pub challenger: Account<'info, Challenger>,

    /// The challenger vault token account (validates it exists)
    #[account(
        seeds = [
            CHALLENGER_VAULT_SEED,
            challenger.key().as_ref(),
        ],
        bump,
        constraint = challenger_vault.mint == config.stake_mint,
    )]
    pub challenger_vault: Account<'info, TokenAccount>,
}

pub fn handler(ctx: Context<RequestUnstakeChallenger>) -> Result<()> {
    let challenger = &mut ctx.accounts.challenger;
    let current_slot = Clock::get()?.slot;

    // Check if unstake already requested
    require!(
        challenger.unstake_requested_slot == 0,
        PobError::UnstakeAlreadyRequested
    );

    // Set unstake request timestamp
    challenger.unstake_requested_slot = current_slot;

    Ok(())
}
