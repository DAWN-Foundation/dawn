use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use raydium_cp_swap::{program::RaydiumCpSwap, states::PoolState};
use solana_program::clock::SECONDS_PER_DAY;

use super::{Config, DawnApp, Plan, Subscription};
use crate::{
    error::DawnError, events::SubscriptionExtended, instructions::PaymentAccounts,
    utils::optional_pubkey_seed,
};

#[derive(Accounts)]
pub struct ExtendSubscription<'info> {
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

    /// The subscription account
    #[account(
        mut,
        seeds = [
            b"subscription",
            plan.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump
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
    pub fn extend_subscription(ctx: Context<ExtendSubscription>) -> Result<()> {
        let config = &ctx.accounts.config;
        let plan = &ctx.accounts.plan;

        let payment_accounts = PaymentAccounts {
            caller: &ctx.accounts.caller,
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
        };

        let (_, _, swap_price) = Self::process_payment(payment_accounts, config, plan)?;

        let subscription = &mut ctx.accounts.subscription;

        // Calculate plan duration in seconds (days to seconds)
        let duration_in_seconds = (plan.duration as u64)
            .checked_mul(SECONDS_PER_DAY)
            .ok_or(DawnError::Overflow)?;

        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;

        // if subscription is expired, set expiration starting from now
        let expiration = if subscription.expiration < current_timestamp {
            current_timestamp + duration_in_seconds as i64
        } else {
            // Calculate subscription expiration by adding plan `duration` days to existing expiration
            subscription
                .expiration
                .checked_add(duration_in_seconds as i64)
                .ok_or(DawnError::Overflow)?
        };

        // Save subscription data
        subscription.expiration = expiration;

        emit!(SubscriptionExtended {
            subscription: subscription.key(),
            plan: plan.key(),
            subscriber: ctx.accounts.caller.key(),
            device: subscription.device,
            expiration: subscription.expiration,
            swap_price,
            created_at: subscription.created_at,
        });

        Ok(())
    }
}
