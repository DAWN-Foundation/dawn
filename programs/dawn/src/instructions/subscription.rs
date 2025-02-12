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

use super::{Config, DawnApp, Plan};
use crate::{
    constants::BPS_DENOMINATOR,
    utils::{optional_pubkey_seed, sort_accounts, swap_amounts},
    DawnError, Subscribed,
};

/// The plan account, representing a subscription plan tied to a device
#[account]
pub struct Subscription {
    /// The creation timestamp
    pub created_at: i64,
    /// The plan subscriber
    pub subscriber: Pubkey,
    /// Associated subscription plan
    pub plan: Pubkey,
    /// Subscription expiration time (UNIX timestamp in seconds)
    pub expiration: i64,
    /// Last claim timestamp for DAWN tokens
    pub last_claim: i64,
    /// Next claimable amount of DAWN tokens
    pub claimable_dawn: u64,
    /// Daily USDC portion for swaps
    pub daily_usdc: u64,
    /// PDA bump seed
    pub bump: u8,
}

const SUBSCRIPTION_SIZE: usize = 8 // id
    + 8 // created_at 
    + 32 // subscriber
    + 32 // plan
    + 8 // expiration
    + 8 // last_claim
    + 8 // claimable_dawn
    + 8 // daily_usdc
    + 1; // bump

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
            plan.device.as_ref(),
            &optional_pubkey_seed(plan.is_resale.then_some(plan.parent_plan)),
            &plan.price.to_le_bytes(),
            &plan.duration.to_le_bytes(),
            &plan.speed.to_le_bytes(),
            &plan.capacity.to_le_bytes(),
            &plan.start_at.to_le_bytes(),
            &plan.sla_id.to_le_bytes(),
        ],
        bump = plan.bump
    )]
    pub plan: Box<Account<'info, Plan>>,

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
    fn calculate_usdc_fee(
        source: u64,
        dao_fee_bps: u64,
        validator_fee_bps: u64,
        medallion_fee_bps: u64,
        plan_duration: u16,
    ) -> Result<(u64, u64, u64)> {
        let dao_usdc_fee = source
            .checked_mul(dao_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(DawnError::Underflow)?;

        let validator_usdc_fee = source
            .checked_mul(validator_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(DawnError::Underflow)?;

        let medallion_usdc_fee = source
            .checked_mul(medallion_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(DawnError::Underflow)?;

        let total_usdc_fee = dao_usdc_fee
            .checked_add(validator_usdc_fee)
            .ok_or(DawnError::Overflow)?
            .checked_add(medallion_usdc_fee)
            .ok_or(DawnError::Overflow)?;

        let remainder = source.saturating_sub(total_usdc_fee);

        let escrow_dawn_in_usdc = remainder
            .checked_div(plan_duration as u64)
            .ok_or(DawnError::Underflow)?;

        let escrow_usdc_remainder = remainder.saturating_sub(escrow_dawn_in_usdc);

        Ok((total_usdc_fee, escrow_dawn_in_usdc, escrow_usdc_remainder))
    }

    fn calculate_dawn_fees(
        total_dawn: u64,
        escrow_dawn_in_usdc: u64,
        price: u128,
        dao_fee_bps: u64,
        validator_fee_bps: u64,
        medallion_fee_bps: u64,
    ) -> Result<(u64, u64, u64, u64)> {
        // Calculate escrow DAWN amount based on the USDC amount and price
        let escrow_dawn = (escrow_dawn_in_usdc as u128)
            .checked_mul(price)
            .ok_or(DawnError::Overflow)?
            .checked_div(Q32)
            .ok_or(DawnError::Underflow)? as u64;

        // The remaining DAWN is for fees
        let remaining_dawn = total_dawn.saturating_sub(escrow_dawn);

        // Calculate total fee basis points
        let total_fee_bps = dao_fee_bps + validator_fee_bps + medallion_fee_bps;

        // Calculate each fee based on the total source amount
        let dao_dawn_fee = remaining_dawn
            .checked_mul(dao_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(total_fee_bps)
            .ok_or(DawnError::Underflow)?;

        let validator_dawn_fee = remaining_dawn
            .checked_mul(validator_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(total_fee_bps)
            .ok_or(DawnError::Underflow)?;

        let medallion_dawn_fee = remaining_dawn
            .checked_mul(medallion_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(total_fee_bps)
            .ok_or(DawnError::Underflow)?;

        Ok((
            dao_dawn_fee,
            validator_dawn_fee,
            medallion_dawn_fee,
            escrow_dawn,
        ))
    }

    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        let plan = &ctx.accounts.plan;

        if plan.start_at > 0 {
            let now = Clock::get()?.unix_timestamp;
            // Make sure the plan has already started
            require!(plan.start_at <= now, DawnError::InvalidStartTime);
        }

        let (pool_mint_0, pool_mint_1, pool_vault_0, pool_vault_1) = {
            let pool_state = ctx.accounts.raydium_pool.load()?;
            (
                pool_state.token_0_mint,
                pool_state.token_1_mint,
                pool_state.token_0_vault,
                pool_state.token_1_vault,
            )
        };

        // Determine input and output tokens and vaults
        let (
            input_mint,
            input_vault,
            input_token_account,
            output_mint,
            output_vault,
            output_token_account,
            is_usdc_base,
        ) = sort_accounts(
            pool_mint_0,
            pool_mint_1,
            pool_vault_0,
            pool_vault_1,
            ctx.accounts.usdc_mint.to_account_info(),
            ctx.accounts.dawn_mint.to_account_info(),
            ctx.accounts.raydium_usdc_vault.to_account_info(),
            ctx.accounts.raydium_dawn_vault.to_account_info(),
            ctx.accounts.user_usdc_account.to_account_info(),
            ctx.accounts.user_dawn_account.to_account_info(),
        )?;

        // calculate the total USDC fee and remainder
        let (total_usdc_fee, escrow_dawn_in_usdc, escrow_usdc_remainder) =
            Self::calculate_usdc_fee(
                plan.price,
                ctx.accounts.config.dao_fee,
                ctx.accounts.config.validator_fee,
                ctx.accounts.config.medallion_fee,
                plan.duration,
            )?;

        // Calculate swap amounts in USDC
        let usdc_to_swap = total_usdc_fee.saturating_add(escrow_dawn_in_usdc);
        let (usdc_amount_in, minimum_dawn_amount_out, price) = swap_amounts(
            &ctx.accounts.raydium_pool,
            &ctx.accounts.raydium_usdc_vault,
            &ctx.accounts.raydium_dawn_vault,
            is_usdc_base,
            usdc_to_swap,
        )?;

        // Create CPI accounts for the swap
        let swap_cpi = cpi::accounts::Swap {
            payer: ctx.accounts.caller.to_account_info(),
            authority: ctx.accounts.raydium_authority.to_account_info(),
            amm_config: ctx.accounts.raydium_config.to_account_info(),
            pool_state: ctx.accounts.raydium_pool.to_account_info(),
            input_token_account,
            output_token_account,
            input_vault,
            output_vault,
            input_token_mint: input_mint,
            output_token_mint: output_mint,
            input_token_program: ctx.accounts.token_program.to_account_info(),
            output_token_program: ctx.accounts.token_program.to_account_info(),
            observation_state: ctx.accounts.raydium_observation.to_account_info(),
        };
        let swap_cpi_ctx = CpiContext::new(ctx.accounts.raydium.to_account_info(), swap_cpi);

        if is_usdc_base {
            // USDC is the base token; use swap_base_input
            cpi::swap_base_input(swap_cpi_ctx, usdc_amount_in, minimum_dawn_amount_out)?;
        } else {
            // USDC is the quote token; use swap_base_output
            cpi::swap_base_output(swap_cpi_ctx, usdc_amount_in, minimum_dawn_amount_out)?;
        }

        let (dao_dawn_fee, validator_dawn_fee, medallion_dawn_fee, escrow_dawn) =
            Self::calculate_dawn_fees(
                minimum_dawn_amount_out,
                escrow_dawn_in_usdc,
                price,
                ctx.accounts.config.dao_fee,
                ctx.accounts.config.validator_fee,
                ctx.accounts.config.medallion_fee,
            )?;

        // Transfer DAO DAWN fee from user to DAWN DAO
        let dao_fee_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_dawn_account.to_account_info(),
                to: ctx.accounts.dao_dawn_account.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        );
        token::transfer(dao_fee_cpi_ctx, dao_dawn_fee)?;

        // Transfer Validator DAWN fee from user to Validator pool
        let validator_fee_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_dawn_account.to_account_info(),
                to: ctx.accounts.validator_dawn_account.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        );
        token::transfer(validator_fee_cpi_ctx, validator_dawn_fee)?;

        // Transfer Medallion DAWN fee from user to Medallion pool
        let medallion_fee_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_dawn_account.to_account_info(),
                to: ctx.accounts.medallion_dawn_account.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        );
        token::transfer(medallion_fee_cpi_ctx, medallion_dawn_fee)?;

        // Deposit escrow DAWN into escrow DAWN vault
        let escrow_dawn_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_dawn_account.to_account_info(),
                to: ctx.accounts.escrow_dawn_vault.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        );
        token::transfer(escrow_dawn_cpi_ctx, escrow_dawn)?;

        // Deposit remainder into escrow USDC vault
        let remainder_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_usdc_account.to_account_info(),
                to: ctx.accounts.escrow_usdc_vault.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        );
        token::transfer(remainder_cpi_ctx, escrow_usdc_remainder)?;

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
        subscription.subscriber = ctx.accounts.caller.key();
        subscription.plan = ctx.accounts.plan.key();
        subscription.expiration = expiration;
        subscription.last_claim = current_timestamp;
        subscription.claimable_dawn = escrow_dawn; // Initial DAWN amount is locked for 24h
        subscription.daily_usdc = escrow_dawn_in_usdc;
        subscription.bump = ctx.bumps.subscription;

        emit!(Subscribed {
            subscription: subscription.key(),
            subscriber: ctx.accounts.caller.key(),
            plan: ctx.accounts.plan.key(),
            expiration: subscription.expiration,
            swap_price: price,
            created_at: subscription.created_at,
        });

        Ok(())
    }
}
