use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Token, TokenAccount},
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
    /// Subscription expiration date (UNIX timestamp OR block height)
    pub expiration: u64,
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
    pub config: Account<'info, Config>,

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
    pub plan: Account<'info, Plan>,

    /// The subscription account
    #[account(
        init,
        payer = caller,
        space = SUBSCRIPTION_SIZE,
        seeds = [
            b"suscription",
            plan.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump
    )]
    pub subscription: Account<'info, Subscription>,

    /// The Andrena USDC token account
    #[account(mut, address = config.andrena_usdc_account)]
    pub andrena_usdc_account: Account<'info, TokenAccount>,

    /// The DAWN Foundation USDC token account
    #[account(mut, address = config.dawn_usdc_account)]
    pub dawn_usdc_account: Account<'info, TokenAccount>,

    /// The callers associated USDC token account
    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = caller,
    )]
    pub user_usdc_account: Account<'info, TokenAccount>,

    /// The associated plan building owner USDC token account
    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = plan.owner,
    )]
    pub bo_usdc_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl PlanApp {
    fn calculate_fees(price: u64, andrena_fee: u64, dawn_fee: u64) -> Result<(u64, u64, u64)> {
        let andrena_fee = price
            .checked_mul(andrena_fee)
            .ok_or(PlanError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(PlanError::Underflow)?;

        let dawn_fee = price
            .checked_mul(dawn_fee)
            .ok_or(PlanError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(PlanError::Underflow)?;

        let remainder = price.saturating_sub(andrena_fee).saturating_sub(dawn_fee);

        Ok((andrena_fee, dawn_fee, remainder))
    }

    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        let config = &ctx.accounts.config;
        let plan = &ctx.accounts.plan;
        let subscription = &mut ctx.accounts.subscription;

        msg!("Subscribing to plan price: {:?}", plan.price);

        // Calculate fees and remainder of plan price for building owner
        let (andrena_fee, dawn_fee, remainder) =
            Self::calculate_fees(plan.price, config.andrena_fee, config.dawn_fee)?;

        // Transfer Andrena USDC fee from user to Andrena
        let andrena_fee_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_usdc_account.to_account_info(),
                to: ctx.accounts.andrena_usdc_account.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        );
        token::transfer(andrena_fee_cpi_ctx, andrena_fee)?;

        // Transfer DAWN Foundation USDC fee from user to DAWN Foundation
        let dawn_fee_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_usdc_account.to_account_info(),
                to: ctx.accounts.dawn_usdc_account.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        );
        token::transfer(dawn_fee_cpi_ctx, dawn_fee)?;

        // Transfer remainder of plan price from user to building owner
        let bo_fee_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_usdc_account.to_account_info(),
                to: ctx.accounts.bo_usdc_account.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        );
        token::transfer(bo_fee_cpi_ctx, remainder)?;

        // Save subscription data
        subscription.subscriber = ctx.accounts.caller.key();
        subscription.plan = ctx.accounts.plan.key();
        subscription.expiration = 0; // TODO: set expiration from plan duration
        subscription.bump = ctx.bumps.subscription;

        emit!(Subscribed {
            subscriber: ctx.accounts.caller.key(),
        });

        Ok(())
    }
}
