use anchor_lang::{prelude::*, solana_program::clock::SECONDS_PER_DAY};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use raydium_cp_swap::{cpi, program::RaydiumCpSwap, states::PoolState};
use solana_program::pubkey::MAX_SEED_LEN;
use std::cmp::min;

use super::{Config, DawnApp, Device, Plan, Subscription, SUBSCRIPTION_SIZE};
use crate::{
    instructions::PaymentAccounts,
    utils::{optional_pubkey_seed, sort_accounts, swap_amounts},
    DawnError, Subscribed,
};

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and accounts
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// The plan account
    #[account(
        seeds = [
            b"plan",
            plan.access_domain.as_ref(),
            plan.device.as_ref(),
            &optional_pubkey_seed(plan.is_resale.then_some(plan.parent_plan)),
            &plan.name.as_bytes(),
            &plan.price.to_le_bytes(),
            &plan.duration.to_le_bytes(),
            &plan.speed.to_le_bytes(),
            &plan.capacity.to_le_bytes(),
            &plan.start_at.to_le_bytes(),
            plan.service_agreement.as_ref(),
        ],
        bump = plan.bump
    )]
    pub plan: Box<Account<'info, Plan>>,

    /// The device account
    #[account(
        constraint = device.owner == caller.key(),
        seeds = [
            b"device",
            device.owner.as_ref(),
            device.model.as_ref(),
            &device.name.as_bytes()[..min(device.name.len(), MAX_SEED_LEN)],
            &device.mac_address,
        ],
        bump = device.bump
    )]
    pub device: Option<Box<Account<'info, Device>>>,

    /// The subscription account
    #[account(
        init,
        payer = caller,
        space = SUBSCRIPTION_SIZE,
        seeds = [
            b"subscription",
            plan.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump
    )]
    pub subscription: Box<Account<'info, Subscription>>,

    // MINTS
    /// The DAWN mint account
    #[account(address = config.dawn_mint)]
    pub dawn_mint: Box<Account<'info, Mint>>,
    /// The USDC mint account
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

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

    // TOKEN ACCOUNTS
    /// The callers associated DAWN token account
    #[account(
        mut,
        associated_token::mint = dawn_mint,
        associated_token::authority = caller,
    )]
    pub user_dawn_account: Box<Account<'info, TokenAccount>>,

    /// The callers associated USDC token account
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = caller,
    )]
    pub user_usdc_account: Box<Account<'info, TokenAccount>>,

    /// The DAWN DAO DAWN token account
    #[account(mut, address = config.dao_dawn_account)]
    pub dao_dawn_account: Box<Account<'info, TokenAccount>>,

    /// The Validator DAWN pool token account
    #[account(mut,address = config.validator_dawn_account)]
    pub validator_dawn_account: Box<Account<'info, TokenAccount>>,

    /// The Medallion DAWN pool token account
    #[account(mut, address = config.medallion_dawn_account)]
    pub medallion_dawn_account: Box<Account<'info, TokenAccount>>,

    /// The device owner escrow USDC token vault
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = usdc_mint,
        associated_token::authority = plan,
    )]
    pub escrow_usdc_vault: Box<Account<'info, TokenAccount>>,

    /// The device owner escrow DAWN token vault
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = dawn_mint,
        associated_token::authority = plan,
    )]
    pub escrow_dawn_vault: Box<Account<'info, TokenAccount>>,

    // PROGRAMS
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        let config = &ctx.accounts.config;
        let plan = &ctx.accounts.plan;

        if plan.start_at > 0 {
            let now = Clock::get()?.unix_timestamp;
            // Make sure the plan has already started
            require!(plan.start_at <= now, DawnError::InvalidStartTime);
        }

        let payment_accounts = PaymentAccounts {
            caller: &ctx.accounts.caller,
            config: &ctx.accounts.config.to_account_info(),
            plan: &ctx.accounts.plan,
            subscription: &ctx.accounts.subscription,
            raydium_pool: &ctx.accounts.raydium_pool,
            raydium_authority: &ctx.accounts.raydium_authority,
            raydium_config: &ctx.accounts.raydium_config,
            raydium_observation: &ctx.accounts.raydium_observation,
            usdc_mint: &ctx.accounts.usdc_mint,
            dawn_mint: &ctx.accounts.dawn_mint,
            raydium: &ctx.accounts.raydium,
            raydium_usdc_vault: &ctx.accounts.raydium_usdc_vault,
            raydium_dawn_vault: &ctx.accounts.raydium_dawn_vault,
            user_usdc_account: &ctx.accounts.user_usdc_account,
            user_dawn_account: &ctx.accounts.user_dawn_account,
            dao_dawn_account: &ctx.accounts.dao_dawn_account,
            validator_dawn_account: &ctx.accounts.validator_dawn_account,
            medallion_dawn_account: &ctx.accounts.medallion_dawn_account,
            escrow_usdc_vault: &ctx.accounts.escrow_usdc_vault,
            escrow_dawn_vault: &ctx.accounts.escrow_dawn_vault,
            token_program: &ctx.accounts.token_program,
            associated_token_program: &ctx.accounts.associated_token_program,
            system_program: &ctx.accounts.system_program,
        };

        let (claimable_dawn, daily_usdc, swap_price) =
            Self::process_payment(payment_accounts, config, plan)?;

        // Get the current timestamp from the clock
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp; // Current UNIX timestamp (in seconds)

        // Calculate plan duration in seconds (days to seconds)
        let duration_in_seconds = (plan.duration as u64)
            .checked_mul(SECONDS_PER_DAY)
            .ok_or(DawnError::Overflow)?;

        // Calculate subscription expiration by adding plan `duration` days to current timestamp
        let expiration = current_timestamp
            .checked_add(duration_in_seconds as i64)
            .ok_or(DawnError::Overflow)?;

        // Save subscription data
        let subscription = &mut ctx.accounts.subscription;
        subscription.created_at = Clock::get()?.unix_timestamp;
        subscription.plan = ctx.accounts.plan.key();
        subscription.subscriber = ctx.accounts.caller.key();
        subscription.device = ctx.accounts.device.as_ref().map(|d| d.key());
        subscription.expiration = expiration;
        subscription.last_claim = current_timestamp;
        subscription.claimable_dawn = claimable_dawn; // Initial DAWN amount is locked for 24h
        subscription.daily_usdc = daily_usdc;
        subscription.bump = ctx.bumps.subscription;

        emit!(Subscribed {
            subscription: subscription.key(),
            plan: ctx.accounts.plan.key(),
            subscriber: ctx.accounts.caller.key(),
            device: subscription.device,
            expiration: subscription.expiration,
            swap_price,
            created_at: subscription.created_at,
        });

        Ok(())
    }
}
