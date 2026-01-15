use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::error::PobError;
use crate::state::{Config, Prover, PROVER_VAULT_SEED};

#[derive(Accounts)]
pub struct CompleteUnstakeProver<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The config account to read cooldown period and stake mint
    #[account(
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// The stake token mint
    #[account(
        constraint = stake_mint.key() == config.stake_mint
    )]
    pub stake_mint: Account<'info, Mint>,

    /// The prover account - validates authority
    #[account(
        mut,
        close = authority,
        seeds = [
            Prover::SEED_PREFIX.as_ref(),
            prover.authority.as_ref(),
        ],
        bump = prover.bump,
        constraint = prover.authority == authority.key() @ PobError::Unauthorized,
    )]
    pub prover: Account<'info, Prover>,

    /// The user's destination token account to receive stake tokens
    #[account(
        mut,
        constraint = user_token_account.mint == config.stake_mint,
        constraint = user_token_account.owner == authority.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// The prover vault token account to close and return tokens
    #[account(
        mut,
        seeds = [
            PROVER_VAULT_SEED,
            prover.key().as_ref(),
        ],
        bump,
        constraint = prover_vault.mint == config.stake_mint,
    )]
    pub prover_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CompleteUnstakeProver>) -> Result<()> {
    let prover = &ctx.accounts.prover;
    let config = &ctx.accounts.config;
    let current_slot = Clock::get()?.slot;

    // Check if unstake was requested
    require!(
        prover.unstake_requested_slot > 0,
        PobError::UnstakeNotRequested
    );

    // Check if cooldown period has elapsed
    let cooldown_end = prover
        .unstake_requested_slot
        .checked_add(config.unstake_cooldown_slots)
        .ok_or(PobError::Overflow)?;

    require!(current_slot >= cooldown_end, PobError::CooldownNotElapsed);

    // Build the vault PDA signer seeds
    let prover_key = prover.key();
    let vault_bump = ctx.bumps.prover_vault;
    let signer_seeds: &[&[&[u8]]] = &[&[PROVER_VAULT_SEED, prover_key.as_ref(), &[vault_bump]]];

    // Get the vault token balance to transfer back
    let vault_balance = ctx.accounts.prover_vault.amount;

    // Transfer tokens back to user
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.prover_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.prover_vault.to_account_info(),
            },
            signer_seeds,
        ),
        vault_balance,
    )?;

    // Close the vault token account, returning rent to authority
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.prover_vault.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.prover_vault.to_account_info(),
        },
        signer_seeds,
    ))?;

    // Prover account will be closed by Anchor via `close = authority` constraint
    Ok(())
}
