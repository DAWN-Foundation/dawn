use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use super::PlanApp;

#[account]
pub struct Config {
    /// The authority that can update the config
    pub authority: Pubkey,
    /// The bump seed used to derive the account address
    pub bump: u8,

    // FEES
    /// The fee charged by DAWN foundation (2%)
    pub dawn_fee: u64,
    /// The fee charged by Andrena (5%)
    pub andrena_fee: u64,

    // RATIOS
    /// Andrena Commission in DAWN (90%)
    pub andrena_dawn_ratio: u64,
    /// Building Owner Commission in DAWN (80%)
    pub bo_dawn_ratio: u64,
    /// Building Owner Escrow ratio (20%)
    pub bo_escrow_ratio: u64,

    // MINTS
    /// The USDC mint account
    pub usdc_mint: Pubkey,
    /// The DAWN mint account
    pub dawn_mint: Pubkey,

    // TOKEN ACCOUNTS
    /// The Andrena USDC token account
    pub andrena_usdc_account: Pubkey,
    /// The Andrena DAWN token account
    pub andrena_dawn_account: Pubkey,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and ratios applied to the plan payments
    #[account(
        init,
        payer = caller,
        space = 8 + (8 * 5) + (32 * 5) + 1,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    /// The USDC mint account
    #[account(mut)]
    pub usdc_mint: Account<'info, Mint>,
    /// The DAWN mint account
    #[account(mut)]
    pub dawn_mint: Account<'info, Mint>,

    /// The Andrena USDC token account
    #[account(mut)]
    pub andrena_usdc_account: Account<'info, TokenAccount>,
    /// The Andrena DAWN token account
    #[account(mut)]
    pub andrena_dawn_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl PlanApp {
    pub fn initialize(
        ctx: Context<Initialize>,
        dawn_fee: u64,
        andrena_fee: u64,
        andrena_dawn_ratio: u64,
        bo_dawn_ratio: u64,
        bo_escrow_ratio: u64,
    ) -> Result<()> {
        msg!(
            "Initializing the PlanApp program by {}",
            ctx.accounts.caller.key()
        );

        let config = &mut ctx.accounts.config;

        // make caller the authority
        config.authority = ctx.accounts.caller.key();

        // bump seed
        config.bump = ctx.bumps.config;

        // fees
        config.dawn_fee = dawn_fee;
        config.andrena_fee = andrena_fee;

        // ratios
        config.andrena_dawn_ratio = andrena_dawn_ratio;
        config.bo_dawn_ratio = bo_dawn_ratio;
        config.bo_escrow_ratio = bo_escrow_ratio;

        // mints
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.dawn_mint = ctx.accounts.dawn_mint.key();

        // token accounts
        config.andrena_usdc_account = ctx.accounts.andrena_usdc_account.key();
        config.andrena_dawn_account = ctx.accounts.andrena_dawn_account.key();

        Ok(())
    }
}
