use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use super::{DawnApp, TokenConfig};

#[account]
pub struct Config {
    /// The authority that can update the config
    pub authority: Pubkey,
    /// PDA bump seed
    pub bump: u8,

    // FEES
    /// The fee for DAWN DAO (3%)
    pub dao_fee: u64,
    /// The fee for Validators (3%)
    pub validator_fee: u64,
    /// The fee for Medallion (9%)
    pub medallion_fee: u64,

    // MINTS
    /// The token config account that owns the DAWN mint
    pub token_config: Pubkey,
    /// The USDC mint account
    pub usdc_mint: Pubkey,
    /// The DAWN mint account
    pub dawn_mint: Pubkey,

    // TOKEN ACCOUNTS
    /// The DAWN DAO DAWN token account
    pub dao_dawn_account: Pubkey,
    /// The validator DAWN pool token account
    pub validator_dawn_account: Pubkey,
    /// The medallion DAWN pool token account
    pub medallion_dawn_account: Pubkey,

    // DEX SWAP
    /// The Raydium program account
    pub raydium: Pubkey,
    /// The Raydium authority account
    pub raydium_authority: Pubkey,
    /// The Raydium config account
    pub raydium_config: Pubkey,
    /// The Raydium DAWN/USDC pool account
    pub raydium_pool: Pubkey,
    /// The Raydium observation account
    pub raydium_observation: Pubkey,
}

pub const CONFIG_SIZE: usize = 8 // id
    + 32 // authority 
    + 8 // dao_fee
    + 8 // validator_fee
    + 8 // medallion_fee
    + 32 // token_config
    + 32 // usdc_mint
    + 32 // dawn_mint
    + 32 // dao_dawn_account
    + 32 // validator_dawn_account
    + 32 // medallion_dawn_account
    + 32 // raydium
    + 32 // raydium_authority
    + 32 // raydium_config
    + 32 // raydium_pool
    + 32 // raydium_observation
    + 1; // bump

#[derive(Accounts)]
pub struct Configure<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and ratios applied to the plan payments
    #[account(
        init_if_needed,
        payer = caller,
        space = CONFIG_SIZE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    /// The token config account that owns the DAWN mint
    #[account(
        seeds = [b"token"],
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

    /// The DAWN DAO DAWN token account
    #[account(token::mint = dawn_mint)]
    pub dao_dawn_account: Account<'info, TokenAccount>,
    /// The validator DAWN pool token account
    #[account(token::mint = dawn_mint)]
    pub validator_dawn_account: Account<'info, TokenAccount>,
    /// The medallion DAWN pool token account
    #[account(token::mint = dawn_mint)]
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
    pub fn configure(
        ctx: Context<Configure>,
        dao_fee: u64,
        validator_fee: u64,
        medallion_fee: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;

        // make caller the authority
        config.authority = ctx.accounts.caller.key();

        // bump seed
        config.bump = ctx.bumps.config;

        // fees
        config.dao_fee = dao_fee;
        config.validator_fee = validator_fee;
        config.medallion_fee = medallion_fee;

        // mints
        config.token_config = ctx.accounts.token_config.key();
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.dawn_mint = ctx.accounts.dawn_mint.key();

        // token accounts
        config.dao_dawn_account = ctx.accounts.dao_dawn_account.key();
        config.validator_dawn_account = ctx.accounts.validator_dawn_account.key();
        config.medallion_dawn_account = ctx.accounts.medallion_dawn_account.key();

        // raydium
        config.raydium = ctx.accounts.raydium.key();
        config.raydium_authority = ctx.accounts.raydium_authority.key();
        config.raydium_pool = ctx.accounts.raydium_pool.key();
        config.raydium_config = ctx.accounts.raydium_config.key();
        config.raydium_observation = ctx.accounts.raydium_observation.key();

        Ok(())
    }
}
