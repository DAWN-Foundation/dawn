use std::ops::Add;

use anchor_lang::{prelude::*, solana_program::clock::SECONDS_PER_DAY};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
    token_2022::Token2022,
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

    // /// The plan account
    // #[account(
    //     seeds = [
    //         b"plan",
    //         plan.building.as_ref(),
    //         &plan.price.to_le_bytes(),
    //         &plan.duration.to_le_bytes(),
    //         &plan.speed.to_le_bytes(),
    //         &plan.capacity.to_le_bytes(),
    //         &plan.sla_id.to_le_bytes(),
    //     ],
    //     bump = plan.bump
    // )]
    // pub plan: Box<Account<'info, Plan>>,

    // /// The subscription account
    // #[account(
    //     init_if_needed,
    //     payer = caller,
    //     space = SUBSCRIPTION_SIZE,
    //     seeds = [
    //         b"subscription",
    //         plan.key().as_ref(),
    //         caller.key().as_ref(),
    //     ],
    //     bump
    // )]
    // pub subscription: Box<Account<'info, Subscription>>,

    // MINTS
    /// The USDC mint account
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    /// The DAWN mint account
    #[account(address = config.dawn_mint)]
    pub dawn_mint: Box<Account<'info, Mint>>,

    // // RAYDIUM
    // /// The Raydium program account
    // #[account(address = config.raydium)]
    // pub raydium: Program<'info, AmmV3>,

    // /// The Raydium config account
    // /// CHECK: Verified in Raydium upon CPI
    // #[account(address = config.raydium_config)]
    // pub raydium_config: UncheckedAccount<'info>,

    // /// The Raydium pool account
    // /// CHECK: Address checked to match the pool from config
    // #[account(mut, address = config.raydium_pool)]
    // pub raydium_pool: UncheckedAccount<'info>,

    // /// The Raydium observation account
    // /// CHECK: Address checked to match the pool observation key
    // #[account(mut, address = config.raydium_observation)]
    // pub raydium_observation: UncheckedAccount<'info>,

    // // VAULTS
    // /// The USDC pool vault account
    // #[account(
    //     mut,
    //     token::mint = usdc_mint,
    //     token::authority = raydium_pool,
    //     token::token_program = token_program,
    // )]
    // pub usdc_vault: Box<Account<'info, TokenAccount>>,

    // /// The DAWN pool vault account
    // #[account(
    //     mut,
    //     token::mint = dawn_mint,
    //     token::authority = raydium_pool,
    //     token::token_program = token_program,
    // )]
    // pub dawn_vault: Box<Account<'info, TokenAccount>>,

    // // TOKEN ACCOUNTS
    // /// The DAWN DAO DAWN token account
    // #[account(address = config.dao_dawn_account)]
    // pub dao_dawn_account: Box<Account<'info, TokenAccount>>,

    // /// The Validator DAWN pool token account
    // #[account(address = config.validator_dawn_account)]
    // pub validator_dawn_account: Box<Account<'info, TokenAccount>>,

    // /// The Medallion DAWN pool token account
    // #[account(address = config.medallion_dawn_account)]
    // pub medallion_dawn_account: Box<Account<'info, TokenAccount>>,
    /// The callers associated USDC token account
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = caller,
    )]
    pub user_usdc_account: Box<Account<'info, TokenAccount>>,

    /// The callers associated DAWN token account
    #[account(
        mut,
        associated_token::mint = dawn_mint,
        associated_token::authority = caller,
    )]
    pub user_dawn_account: Box<Account<'info, TokenAccount>>,

    // PROGRAMS
    // /// The memo program account
    // /// CHECK: Address checked to match the memo program ID
    // #[account(address = config.memo_program)]
    // pub memo_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub token_program_2022: Program<'info, Token2022>,
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

    pub fn subscribe<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Subscribe<'info>>,
    ) -> Result<()> {
       

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

        // // Get the current timestamp from the clock
        // let clock = Clock::get()?;
        // let current_timestamp = clock.unix_timestamp; // Current UNIX timestamp (in seconds)

        // // Calculate plan duration in seconds (days to seconds)
        // let duration_in_seconds = (plan.duration as u64)
        //     .checked_mul(SECONDS_PER_DAY)
        //     .ok_or(PlanError::Overflow)?;

        // // calculate subscription expiration by adding plan `duration` days to current timestamp
        // let expiration = current_timestamp
        //     .checked_add(duration_in_seconds as i64)
        //     .ok_or(PlanError::Overflow)?;

        // // Save subscription data
        // subscription.subscriber = ctx.accounts.caller.key();
        // subscription.plan = ctx.accounts.plan.key();
        // subscription.expiration = expiration;
        // subscription.bump = ctx.bumps.subscription;

        // emit!(Subscribed {
        //     subscription: subscription.key(),
        //     subscriber: ctx.accounts.caller.key(),
        //     plan: ctx.accounts.plan.key(),
        //     expiration: subscription.expiration,
        // });

        Ok(())
    }
}
