use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{constants::BPS_DENOMINATOR, error::DawnError, state::Config, DawnApp, TokenConfig};

/// Context for one-time initialization of the protocol config
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and ratios applied to the plan payments
    #[account(
        init,
        payer = caller,
        space = Config::SIZE,
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump
    )]
    pub config: Account<'info, Config>,

    /// The token config account that owns the DAWN mint
    #[account(
        seeds = [TokenConfig::SEED_PREFIX.as_ref()],
        bump = token_config.bump,
    )]
    pub token_config: Account<'info, TokenConfig>,

    /// The USDC mint account
    #[account()]
    pub usdc_mint: Account<'info, Mint>,

    /// The DAWN mint account
    #[account(
        seeds = [b"dawn"],
        bump = token_config.mint_bump,
    )]
    pub dawn_mint: Account<'info, Mint>,

    /// The fee pool DAWN token account
    #[account(
        seeds = [b"fee_pool_dawn_account"],
        bump = token_config.fee_pool_bump,
    )]
    pub fee_pool_dawn_account: Account<'info, TokenAccount>,

    /// The DAWN DAO DAWN token account
    #[account(
        seeds = [b"dao_dawn_account"],
        bump = token_config.dao_bump,
    )]
    pub dao_dawn_account: Account<'info, TokenAccount>,

    /// The validator DAWN pool token account
    #[account(
        seeds = [b"validator_dawn_account"],
        bump = token_config.validator_bump,
    )]
    pub validator_dawn_account: Account<'info, TokenAccount>,

    /// The medallion DAWN pool token account
    #[account(
        seeds = [b"medallion_dawn_account"],
        bump = token_config.medallion_bump,
    )]
    pub medallion_dawn_account: Account<'info, TokenAccount>,

    /// The Raydium account
    /// CHECK: Assumes authority has set this to Raydium program account correctly
    pub raydium: UncheckedAccount<'info>,

    /// The Raydium authority account
    /// CHECK: Assumes authority has set this to Raydium authority account correctly
    pub raydium_authority: UncheckedAccount<'info>,

    /// The Raydium config account
    /// CHECK: Assumes authority has set this to Raydium config account correctly
    pub raydium_config: UncheckedAccount<'info>,

    /// The Raydium DAWN/USDC pool account
    /// CHECK: Assumes authority has set this to Raydium DAWN/USDC pool account correctly
    pub raydium_pool: UncheckedAccount<'info>,

    /// The Raydium observation account
    /// CHECK: Assumes authority has set this to Raydium observation account correctly
    pub raydium_observation: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl DawnApp {
    /// Initialize the protocol config (one-time only)
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        dao_fee: u64,
        validator_fee: u64,
        medallion_fee: u64,
    ) -> Result<()> {
        // Validate fee bounds - each fee must be <= 10,000 BPS (100%)
        require!(dao_fee <= BPS_DENOMINATOR, DawnError::InvalidFeeBps);
        require!(validator_fee <= BPS_DENOMINATOR, DawnError::InvalidFeeBps);
        require!(medallion_fee <= BPS_DENOMINATOR, DawnError::InvalidFeeBps);

        // Validate total fees don't exceed 100%
        let total_fees = dao_fee
            .checked_add(validator_fee)
            .ok_or(DawnError::Overflow)?
            .checked_add(medallion_fee)
            .ok_or(DawnError::Overflow)?;

        require!(total_fees <= BPS_DENOMINATOR, DawnError::TotalFeesExceedMax);

        let config = &mut ctx.accounts.config;

        // Set caller as the authority
        config.created_at = Clock::get()?.unix_timestamp;
        config.authority = ctx.accounts.caller.key();

        // Set mints
        config.token_config = ctx.accounts.token_config.key();
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.dawn_mint = ctx.accounts.dawn_mint.key();

        // Set token accounts
        config.fee_pool_dawn_account = ctx.accounts.fee_pool_dawn_account.key();
        config.dao_dawn_account = ctx.accounts.dao_dawn_account.key();
        config.validator_dawn_account = ctx.accounts.validator_dawn_account.key();
        config.medallion_dawn_account = ctx.accounts.medallion_dawn_account.key();

        // Set Raydium accounts
        config.raydium = ctx.accounts.raydium.key();
        config.raydium_authority = ctx.accounts.raydium_authority.key();
        config.raydium_pool = ctx.accounts.raydium_pool.key();
        config.raydium_config = ctx.accounts.raydium_config.key();
        config.raydium_observation = ctx.accounts.raydium_observation.key();

        // Set fees
        config.dao_fee = dao_fee;
        config.validator_fee = validator_fee;
        config.medallion_fee = medallion_fee;

        // Set bump seed
        config.bump = ctx.bumps.config;

        Ok(())
    }
}
