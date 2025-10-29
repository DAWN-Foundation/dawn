use anchor_lang::{
    prelude::*,
    solana_program::{clock::SECONDS_PER_DAY, pubkey::MAX_SEED_LEN},
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use raydium_cp_swap::{program::RaydiumCpSwap, states::PoolState, ID as RAYDIUM_CP_SWAP_ID};
use std::cmp::min;

use crate::{
    app::{subscription::payment, PaymentAccounts},
    constants::MAX_DEADLINE_OFFSET_SECONDS,
    utils::optional_pubkey_seed,
    DawnError, Subscribed,
};
use crate::{
    state::{Config, Device, Plan, Subscription},
    DawnApp,
};

#[derive(Accounts)]
#[instruction(min_dawn_out: u64, deadline: i64)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and accounts
    #[account(
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// The plan account
    #[account(
        seeds = [
            Plan::SEED_PREFIX.as_ref(),
            &plan.local_domain.as_ref(),
            &optional_pubkey_seed(plan.parent_plan),
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
            Device::SEED_PREFIX.as_ref(),
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
        space = Subscription::SIZE,
        seeds = [
            Subscription::SEED_PREFIX.as_ref(),
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
    /// The Raydium program account - MUST be the official Raydium CP Swap program
    #[account(
        address = config.raydium,
        constraint = raydium.key() == RAYDIUM_CP_SWAP_ID @ DawnError::InvalidRaydiumProgram
    )]
    pub raydium: Program<'info, RaydiumCpSwap>,

    /// The Raydium authority account
    /// CHECK: Verified against the config
    #[account(address = config.raydium_authority)]
    pub raydium_authority: UncheckedAccount<'info>,

    /// The Raydium config account
    /// CHECK: Verified in Raydium upon CPI
    #[account(address = config.raydium_config)]
    pub raydium_config: UncheckedAccount<'info>,

    /// The Raydium pool account - MUST be owned by Raydium program
    #[account(
        mut,
        address = config.raydium_pool,
        constraint = raydium_pool.to_account_info().owner == &RAYDIUM_CP_SWAP_ID
            @ DawnError::InvalidRaydiumPoolOwner
    )]
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

    /// The fee pool DAWN token account
    #[account(mut, address = config.fee_pool_dawn_account)]
    pub fee_pool_dawn_account: Box<Account<'info, TokenAccount>>,

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
    pub fn subscribe(
        ctx: Context<Subscribe>,
        min_dawn_out: u64,
        deadline: i64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let plan = &ctx.accounts.plan;

        // Validate deadline hasn't expired and isn't too far in the future
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time <= deadline,
            DawnError::TransactionExpired
        );
        
        let deadline_offset = deadline
            .checked_sub(current_time)
            .ok_or(DawnError::TransactionExpired)?;
        require!(
            deadline_offset <= MAX_DEADLINE_OFFSET_SECONDS,
            DawnError::DeadlineTooFarInFuture
        );

        // Validate min_dawn_out is reasonable (not zero)
        require!(
            min_dawn_out > 0,
            DawnError::InvalidMinimumOutput
        );

        if plan.start_at > 0 {
            // Make sure the plan has already started
            require!(plan.start_at <= current_time, DawnError::InvalidStartTime);
        }

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
            user_dawn_account: &mut ctx.accounts.user_dawn_account,
            fee_pool_dawn_account: &ctx.accounts.fee_pool_dawn_account,
            escrow_usdc_vault: &ctx.accounts.escrow_usdc_vault,
            escrow_dawn_vault: &ctx.accounts.escrow_dawn_vault,
            token_program: &ctx.accounts.token_program,
        };

        let (claimable_dawn, daily_usdc, actual_dawn_out) =
            payment::process_payment(payment_accounts, config, plan, min_dawn_out)?;

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
            last_claim: subscription.last_claim,
            claimable_dawn: subscription.claimable_dawn,
            daily_usdc: subscription.daily_usdc,
            swap_price: actual_dawn_out as u128,
            created_at: subscription.created_at,
        });

        Ok(())
    }
}
