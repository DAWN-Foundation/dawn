use anchor_lang::{prelude::*, solana_program::clock::SECONDS_PER_DAY};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use raydium_cp_swap::{
    cpi,
    program::RaydiumCpSwap,
    states::{PoolState, Q32},
};

use super::{Config, Plan, PlanApp};
use crate::{constants::BPS_DENOMINATOR, PlanError, Subscribed};

/// The plan account, representing a subscription plan tied to a building
#[account]
pub struct Subscription {
    /// The plan subscriber
    pub subscriber: Pubkey,
    /// Associated plan (the subscription plan)
    pub plan: Pubkey,
    /// Subscription expiration time (UNIX timestamp in seconds)
    pub expiration: i64,
    /// Subscription PDA bump seed
    pub bump: u8,
}

const SUBSCRIPTION_SIZE: usize = 8 // id
    + 32 // subscriber
    + 32 // plan
    + 8 // expiration
    + 1; // bump

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and ratios applied to the plan payments
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// The plan account
    #[account(
        seeds = [
            b"plan",
            plan.building.as_ref(),
            &plan.price.to_le_bytes(),
            &plan.duration.to_le_bytes(),
            &plan.speed.to_le_bytes(),
            &plan.capacity.to_le_bytes(),
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
    pub dawn_vault: Box<Account<'info, TokenAccount>>,

    /// The USDC pool vault account
    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

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

    // /// The DAWN DAO DAWN token account
    // #[account(address = config.dao_dawn_account)]
    // pub dao_dawn_account: Box<Account<'info, TokenAccount>>,

    // /// The Validator DAWN pool token account
    // #[account(address = config.validator_dawn_account)]
    // pub validator_dawn_account: Box<Account<'info, TokenAccount>>,

    // /// The Medallion DAWN pool token account
    // #[account(address = config.medallion_dawn_account)]
    // pub medallion_dawn_account: Box<Account<'info, TokenAccount>>,

    // PROGRAMS
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl PlanApp {
    fn calculate_fees(
        price: u64,
        dao_fee: u64,
        validator_fee: u64,
        medallion_fee: u64,
    ) -> Result<(u64, u64, u64, u64)> {
        let dao_fee = price
            .checked_mul(dao_fee)
            .ok_or(PlanError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(PlanError::Underflow)?;

        let validator_fee = price
            .checked_mul(validator_fee)
            .ok_or(PlanError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(PlanError::Underflow)?;

        let medallion_fee = price
            .checked_mul(medallion_fee)
            .ok_or(PlanError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(PlanError::Underflow)?;

        let remainder = price
            .saturating_sub(dao_fee)
            .saturating_sub(validator_fee)
            .saturating_sub(medallion_fee);

        Ok((dao_fee, validator_fee, medallion_fee, remainder))
    }

    fn sort_accounts<'info>(
        pool_mint_0: Pubkey,
        pool_mint_1: Pubkey,
        pool_vault_0: Pubkey,
        pool_vault_1: Pubkey,
        usdc_mint: AccountInfo<'info>,
        dawn_mint: AccountInfo<'info>,
        usdc_vault: AccountInfo<'info>,
        dawn_vault: AccountInfo<'info>,
        user_usdc_account: AccountInfo<'info>,
        user_dawn_account: AccountInfo<'info>,
    ) -> Result<(
        AccountInfo<'info>, // input_mint
        AccountInfo<'info>, // input_vault
        AccountInfo<'info>, // input_token_account
        AccountInfo<'info>, // output_mint
        AccountInfo<'info>, // output_vault
        AccountInfo<'info>, // output_token_account
        bool,               // is_usdc_base
    )> {
        match (
            pool_mint_0 == usdc_mint.key(),
            pool_mint_1 == usdc_mint.key(),
        ) {
            (true, false) => {
                // USDC is token_mint_0, DAWN is token_mint_1
                if pool_mint_1 != dawn_mint.key() {
                    return Err(PlanError::InvalidMint.into());
                }
                // Verify vault addresses
                if pool_vault_0 != usdc_vault.key() || pool_vault_1 != dawn_vault.key() {
                    return Err(PlanError::InvalidVault.into());
                }
                Ok((
                    usdc_mint,
                    usdc_vault,
                    user_usdc_account,
                    dawn_mint,
                    dawn_vault,
                    user_dawn_account,
                    true,
                ))
            }
            (false, true) => {
                // USDC is token_mint_1, DAWN is token_mint_0
                if pool_mint_0 != dawn_mint.key() {
                    return Err(PlanError::InvalidMint.into());
                }
                // Verify vault addresses
                if pool_vault_1 != usdc_vault.key() || pool_vault_0 != dawn_vault.key() {
                    return Err(PlanError::InvalidVault.into());
                }
                Ok((
                    usdc_mint,
                    usdc_vault,
                    user_usdc_account,
                    dawn_mint,
                    dawn_vault,
                    user_dawn_account,
                    false,
                ))
            }
            _ => {
                return Err(PlanError::InvalidMint.into());
            }
        }
    }

    fn swap_amounts(
        ctx: &Context<'_, '_, '_, '_, Subscribe<'_>>,
        is_usdc_base: bool,
        total_fee: u64,
    ) -> Result<(u64, u64)> {
        let pool_state = ctx.accounts.raydium_pool.load()?;
        let slippage_bps = 200; // 2% slippage tolerance

        // sort vaults (usdc and dawn) by key
        let pool = ctx.accounts.raydium_pool.load()?;

        let (vault_0, vault_1) = {
            if ctx.accounts.dawn_vault.key() == pool.token_0_vault.key() {
                (&ctx.accounts.dawn_vault, &ctx.accounts.usdc_vault)
            } else {
                (&ctx.accounts.usdc_vault, &ctx.accounts.dawn_vault)
            }
        };

        // Get current vault amounts and calculate price using pool state's method
        let (token_0_price_x32, token_1_price_x32) =
            pool_state.token_price_x32(vault_0.amount, vault_1.amount);

        msg!("token_0_price_x32: {}", token_0_price_x32);
        msg!("token_1_price_x32: {}", token_1_price_x32);

        let usdc_amount_in = total_fee; // We only swap the fee amount

        // USDC is base, we're calculating DAWN output
        let price = if is_usdc_base && vault_0.key() == ctx.accounts.usdc_vault.key() {
            token_0_price_x32
        } else {
            token_1_price_x32
        };

        msg!("price: {:?}", price);

        let expected_out = (usdc_amount_in as u128)
            .checked_mul(price)
            .ok_or(PlanError::Overflow)?
            .checked_div(Q32)
            .ok_or(PlanError::Underflow)? as u64;

        let minimum_dawn_amount_out = expected_out
            .checked_mul(BPS_DENOMINATOR - slippage_bps)
            .ok_or(PlanError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(PlanError::Underflow)?;

        Ok((usdc_amount_in, minimum_dawn_amount_out))
    }

    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        let plan = &ctx.accounts.plan;

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
        ) = Self::sort_accounts(
            pool_mint_0,
            pool_mint_1,
            pool_vault_0.clone(),
            pool_vault_1.clone(),
            ctx.accounts.usdc_mint.to_account_info(),
            ctx.accounts.dawn_mint.to_account_info(),
            ctx.accounts.usdc_vault.to_account_info(),
            ctx.accounts.dawn_vault.to_account_info(),
            ctx.accounts.user_usdc_account.to_account_info(),
            ctx.accounts.user_dawn_account.to_account_info(),
        )?;

        let (dao_fee, validator_fee, medallion_fee, remainder) = Self::calculate_fees(
            plan.price,
            ctx.accounts.config.dao_fee,
            ctx.accounts.config.validator_fee,
            ctx.accounts.config.medallion_fee,
        )?;
        let total_fee = dao_fee
            .checked_add(validator_fee)
            .ok_or(PlanError::Overflow)?
            .checked_add(medallion_fee)
            .ok_or(PlanError::Overflow)?;

        // Calculate swap amounts in USDC
        // 2% slippage tolerance
        let (usdc_amount_in, minimum_dawn_amount_out) =
            Self::swap_amounts(&ctx, is_usdc_base, total_fee)?;

        msg!("usdc_amount_in: {}", usdc_amount_in);
        msg!("minimum_dawn_amount_out: {}", minimum_dawn_amount_out);

        // Create CPI accounts for the swap
        let cpi_accounts = cpi::accounts::Swap {
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
        let cpi_context = CpiContext::new(ctx.accounts.raydium.to_account_info(), cpi_accounts);

        msg!("is_usdc_base: {:?}", is_usdc_base);

        if is_usdc_base {
            // USDC is the base token; use swap_base_input
            cpi::swap_base_input(cpi_context, usdc_amount_in, minimum_dawn_amount_out)?;
        } else {
            // USDC is the quote token; use swap_base_output
            cpi::swap_base_output(cpi_context, usdc_amount_in, minimum_dawn_amount_out)?;
        }

        // distribute dawn to fee to dao, validator pool and medallion pool

        // deposit remainder into escrow program

        // Transfer DAO DAWN fee from user to DAWN DAO
        // let dao_fee_cpi_ctx = CpiContext::new(
        //     ctx.accounts.token_program.to_account_info(),
        //     token::Transfer {
        //         from: ctx.accounts.user_usdc_account.to_account_info(),
        //         to: ctx.accounts.dawn_usdc_account.to_account_info(),
        //         authority: ctx.accounts.caller.to_account_info(),
        //     },
        // );
        // token::transfer(dawn_fee_cpi_ctx, dawn_fee)?;

        // Get the current timestamp from the clock
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp; // Current UNIX timestamp (in seconds)

        // Calculate plan duration in seconds (days to seconds)
        let duration_in_seconds = (plan.duration as u64)
            .checked_mul(SECONDS_PER_DAY)
            .ok_or(PlanError::Overflow)?;

        // calculate subscription expiration by adding plan `duration` days to current timestamp
        let expiration = current_timestamp
            .checked_add(duration_in_seconds as i64)
            .ok_or(PlanError::Overflow)?;

        // Save subscription data
        let subscription = &mut ctx.accounts.subscription;

        subscription.subscriber = ctx.accounts.caller.key();
        subscription.plan = ctx.accounts.plan.key();
        subscription.expiration = expiration;
        subscription.bump = ctx.bumps.subscription;

        emit!(Subscribed {
            subscription: subscription.key(),
            subscriber: ctx.accounts.caller.key(),
            plan: ctx.accounts.plan.key(),
            expiration: subscription.expiration,
        });

        Ok(())
    }
}
