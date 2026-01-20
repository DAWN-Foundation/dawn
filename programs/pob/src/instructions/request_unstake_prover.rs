use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::error::PobError;
use crate::state::{Config, Prover, PROVER_VAULT_SEED};

#[derive(Accounts)]
pub struct RequestUnstakeProver<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The config account (to validate stake mint)
    #[account(
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// The prover account - validates authority
    #[account(
        mut,
        seeds = [
            Prover::SEED_PREFIX.as_ref(),
            prover.authority.as_ref(),
        ],
        bump = prover.bump,
        constraint = prover.authority == authority.key() @ PobError::Unauthorized,
    )]
    pub prover: Account<'info, Prover>,

    /// The prover vault token account (validates it exists)
    #[account(
        seeds = [
            PROVER_VAULT_SEED,
            prover.key().as_ref(),
        ],
        bump,
        constraint = prover_vault.mint == config.stake_mint,
    )]
    pub prover_vault: Account<'info, TokenAccount>,
}

pub fn handler(ctx: Context<RequestUnstakeProver>) -> Result<()> {
    let prover = &mut ctx.accounts.prover;
    let current_slot = Clock::get()?.slot;

    // Check if unstake already requested
    require!(
        prover.unstake_requested_slot == 0,
        PobError::UnstakeAlreadyRequested
    );

    // Set unstake request timestamp
    prover.unstake_requested_slot = current_slot;

    Ok(())
}
