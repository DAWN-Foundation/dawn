use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::error::PobError;
use crate::state::{Challenger, Config, CHALLENGER_VAULT_SEED};

#[derive(Accounts)]
pub struct CompleteUnstakeChallenger<'info> {
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

    /// The challenger account - validates authority
    #[account(
        mut,
        close = authority,
        seeds = [
            Challenger::SEED_PREFIX.as_ref(),
            challenger.authority.as_ref(),
        ],
        bump = challenger.bump,
        constraint = challenger.authority == authority.key() @ PobError::Unauthorized,
    )]
    pub challenger: Account<'info, Challenger>,

    /// The user's destination token account to receive stake tokens
    #[account(
        mut,
        constraint = user_token_account.mint == config.stake_mint,
        constraint = user_token_account.owner == authority.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// The challenger vault token account to close and return tokens
    #[account(
        mut,
        seeds = [
            CHALLENGER_VAULT_SEED,
            challenger.key().as_ref(),
        ],
        bump,
        constraint = challenger_vault.mint == config.stake_mint,
    )]
    pub challenger_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CompleteUnstakeChallenger>) -> Result<()> {
    let challenger = &ctx.accounts.challenger;
    let config = &ctx.accounts.config;
    let current_slot = Clock::get()?.slot;

    // Check if unstake was requested
    require!(
        challenger.unstake_requested_slot > 0,
        PobError::UnstakeNotRequested
    );

    // Check if cooldown period has elapsed
    let cooldown_end = challenger
        .unstake_requested_slot
        .checked_add(config.unstake_cooldown_slots)
        .ok_or(PobError::Overflow)?;

    require!(current_slot >= cooldown_end, PobError::CooldownNotElapsed);

    // Build the vault PDA signer seeds
    let challenger_key = challenger.key();
    let vault_bump = ctx.bumps.challenger_vault;
    let signer_seeds: &[&[&[u8]]] = &[&[
        CHALLENGER_VAULT_SEED,
        challenger_key.as_ref(),
        &[vault_bump],
    ]];

    // Get the vault token balance to transfer back
    let vault_balance = ctx.accounts.challenger_vault.amount;

    // Transfer tokens back to user
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.challenger_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.challenger_vault.to_account_info(),
            },
            signer_seeds,
        ),
        vault_balance,
    )?;

    // Close the vault token account, returning rent to authority
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.challenger_vault.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.challenger_vault.to_account_info(),
        },
        signer_seeds,
    ))?;

    // Challenger account will be closed by Anchor via `close = authority` constraint
    Ok(())
}
