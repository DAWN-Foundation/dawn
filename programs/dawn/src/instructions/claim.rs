use anchor_lang::{prelude::*, solana_program::clock::SECONDS_PER_DAY};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use raydium_cp_swap::{
    cpi,
    program::RaydiumCpSwap,
    states::{PoolState, Q32},
};

use super::{Config, DawnApp, Plan, Subscription};
use crate::{constants::BPS_DENOMINATOR, DawnError, Subscribed};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and accounts
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// The subscription account
    #[account(
        mut,
        seeds = [
            b"subscription",
            subscription.plan.as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump,
        constraint = subscription.subscriber == caller.key(),
    )]
    pub subscription: Box<Account<'info, Subscription>>,

    /// The DAWN token mint
    #[account(address = config.dawn_mint)]
    pub dawn_mint: Box<Account<'info, Mint>>,

    /// The USDC token mint
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    /// The building owner escrow USDC token vault
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = usdc_mint,
        associated_token::authority = subscription,
    )]
    pub escrow_usdc_vault: Box<Account<'info, TokenAccount>>,

    /// The building owner escrow DAWN token vault
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = dawn_mint,
        associated_token::authority = subscription,
    )]
    pub escrow_dawn_vault: Box<Account<'info, TokenAccount>>,

    // RAYDIUM
    /// The Raydium program account
    #[account(address = config.raydium)]
    pub raydium: Program<'info, RaydiumCpSwap>,

    /// The Raydium authority account
    /// CHECK: Verified against the config
    #[account(address = config.raydium_authority)]
    pub raydium_authority: UncheckedAccount<'info>,

    /// The Raydium config account
    /// CHECK: Verified in Raydium upon CPI
    #[account(address = config.raydium_config)]
    pub raydium_config: UncheckedAccount<'info>,

    /// The Raydium pool account
    /// CHECK: Address checked to match the pool from config
    #[account(mut, address = config.raydium_pool)]
    pub raydium_pool: AccountLoader<'info, PoolState>,

    /// The Raydium observation account
    /// CHECK: Address checked to match the pool observation key
    #[account(mut, address = config.raydium_observation)]
    pub raydium_observation: UncheckedAccount<'info>,

    // VAULTS
    /// The DAWN pool vault account
    #[account(
        mut,
        token::mint = dawn_mint,
    )]
    pub raydium_dawn_vault: Box<Account<'info, TokenAccount>>,

    /// The USDC pool vault account
    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub raydium_usdc_vault: Box<Account<'info, TokenAccount>>,

    // PROGRAMS
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        let subscription = &mut ctx.accounts.subscription;

        // Check if 24 hours have passed since last claim
        require!(
            current_time - subscription.last_claim >= SECONDS_PER_DAY as i64,
            DawnError::ClaimTooEarly
        );

        // Calculate number of days since last claim
        let days_since_claim =
            ((current_time - subscription.last_claim) / SECONDS_PER_DAY as i64) as u64;

        // Handle claiming available DAWN
        if subscription.claimable_dawn > 0 {
            // Transfer claimable DAWN to subscriber
            // ... implement transfer ...
            subscription.claimable_dawn = 0;
        }

        // Handle swapping USDC for next period
        let remaining_usdc = ctx.accounts.escrow_usdc_vault.amount;
        if days_since_claim > 0 && remaining_usdc > 0 {
            let usdc_to_swap = days_since_claim
                .checked_mul(subscription.daily_usdc)
                .ok_or(DawnError::Overflow)?
                .min(remaining_usdc);

            if usdc_to_swap > 0 {
                // Perform swap using Raydium
                // ... implement swap ...
                let swapped_dawn_amount = 0;

                // Set newly swapped DAWN as claimable after 24h
                subscription.claimable_dawn = swapped_dawn_amount;
            }
        }

        subscription.last_claim = current_time;

        Ok(())
    }
}
