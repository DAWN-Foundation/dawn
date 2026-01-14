use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::events::ProverRegistered;
use crate::state::{Config, Prover, PROVER_VAULT_SEED};

#[derive(Accounts)]
pub struct RegisterProver<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The config account to read stake requirements and stake mint
    #[account(
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// The stake token mint (must match config.stake_mint)
    #[account(
        constraint = stake_mint.key() == config.stake_mint
    )]
    pub stake_mint: Account<'info, Mint>,

    /// The prover account
    #[account(
        init,
        payer = authority,
        space = Prover::SIZE,
        seeds = [
            Prover::SEED_PREFIX.as_ref(),
            authority.key().as_ref(),
        ],
        bump
    )]
    pub prover: Box<Account<'info, Prover>>,

    /// The user's token account to transfer stake from
    #[account(
        mut,
        constraint = user_token_account.mint == config.stake_mint,
        constraint = user_token_account.owner == authority.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// The prover vault token account (PDA-owned token account)
    /// seeds = [b"prover_vault", prover_pda]
    #[account(
        init,
        payer = authority,
        token::mint = stake_mint,
        token::authority = prover_vault,
        seeds = [
            PROVER_VAULT_SEED,
            prover.key().as_ref(),
        ],
        bump
    )]
    pub prover_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterProver>) -> Result<()> {
    let prover = &mut ctx.accounts.prover;
    let config = &ctx.accounts.config;
    let authority = ctx.accounts.authority.key();
    let current_slot = Clock::get()?.slot;

    // Initialize prover
    prover.authority = authority;
    prover.created_at_slot = current_slot;
    prover.stake_amount = config.prover_stake_amount;
    prover.unstake_requested_slot = 0; // Not requested
    prover.reputation = 1000; // Initial reputation
    prover.bump = ctx.bumps.prover;

    // Transfer stake tokens from user to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.prover_vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        config.prover_stake_amount,
    )?;

    emit!(ProverRegistered {
        prover: prover.key(),
        authority,
        stake_amount: config.prover_stake_amount,
        created_at_slot: current_slot,
    });

    Ok(())
}
