use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::events::ChallengerRegistered;
use crate::state::{Challenger, Config, CHALLENGER_VAULT_SEED};

#[derive(Accounts)]
pub struct RegisterChallenger<'info> {
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

    /// The challenger account
    #[account(
        init,
        payer = authority,
        space = Challenger::SIZE,
        seeds = [
            Challenger::SEED_PREFIX.as_ref(),
            authority.key().as_ref(),
        ],
        bump
    )]
    pub challenger: Box<Account<'info, Challenger>>,

    /// The user's token account to transfer stake from
    #[account(
        mut,
        constraint = user_token_account.mint == config.stake_mint,
        constraint = user_token_account.owner == authority.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// The challenger vault token account (PDA-owned token account)
    /// seeds = [b"challenger_vault", challenger_pda]
    #[account(
        init,
        payer = authority,
        token::mint = stake_mint,
        token::authority = challenger_vault,
        seeds = [
            CHALLENGER_VAULT_SEED,
            challenger.key().as_ref(),
        ],
        bump
    )]
    pub challenger_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterChallenger>) -> Result<()> {
    let challenger = &mut ctx.accounts.challenger;
    let config = &ctx.accounts.config;
    let authority = ctx.accounts.authority.key();
    let current_slot = Clock::get()?.slot;

    // Initialize challenger
    challenger.authority = authority;
    challenger.created_at_slot = current_slot;
    challenger.stake_amount = config.challenger_stake_amount;
    challenger.unstake_requested_slot = 0; // Not requested
    challenger.reputation = 1000; // Initial reputation
    challenger.bump = ctx.bumps.challenger;

    // Transfer stake tokens from user to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.challenger_vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        config.challenger_stake_amount,
    )?;

    emit!(ChallengerRegistered {
        challenger: challenger.key(),
        authority,
        stake_amount: config.challenger_stake_amount,
        created_at_slot: current_slot,
    });

    Ok(())
}
