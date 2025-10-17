use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{constants::BPS_DENOMINATOR, error::DawnError, state::Config, DawnApp, TokenConfig};

/// Context for updating the protocol config (authority-gated)
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and ratios applied to the plan payments
    #[account(
        mut,
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump,
        constraint = caller.key() == config.authority @ DawnError::Unauthorized
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
    /// Update the protocol config (authority-gated)
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        dao_fee: Option<u64>,
        validator_fee: Option<u64>,
        medallion_fee: Option<u64>,
        raydium: Option<Pubkey>,
        raydium_authority: Option<Pubkey>,
        raydium_pool: Option<Pubkey>,
        raydium_config: Option<Pubkey>,
        raydium_observation: Option<Pubkey>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;

        // Update fees if provided, with validation
        if let Some(fee) = dao_fee {
            require!(fee <= BPS_DENOMINATOR, DawnError::InvalidFeeBps);
            config.dao_fee = fee;
        }
        if let Some(fee) = validator_fee {
            require!(fee <= BPS_DENOMINATOR, DawnError::InvalidFeeBps);
            config.validator_fee = fee;
        }
        if let Some(fee) = medallion_fee {
            require!(fee <= BPS_DENOMINATOR, DawnError::InvalidFeeBps);
            config.medallion_fee = fee;
        }

        // Validate total fees after any updates
        let total_fees = config
            .dao_fee
            .checked_add(config.validator_fee)
            .ok_or(DawnError::Overflow)?
            .checked_add(config.medallion_fee)
            .ok_or(DawnError::Overflow)?;

        require!(total_fees <= BPS_DENOMINATOR, DawnError::TotalFeesExceedMax);

        // Update Raydium accounts if provided
        if let Some(raydium_account) = raydium {
            config.raydium = raydium_account;
        }
        if let Some(raydium_authority_account) = raydium_authority {
            config.raydium_authority = raydium_authority_account;
        }
        if let Some(raydium_pool_account) = raydium_pool {
            config.raydium_pool = raydium_pool_account;
        }
        if let Some(raydium_config_account) = raydium_config {
            config.raydium_config = raydium_config_account;
        }
        if let Some(raydium_observation_account) = raydium_observation {
            config.raydium_observation = raydium_observation_account;
        }

        Ok(())
    }
}


