use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::{
    instructions::CreateMetadataAccountV3CpiBuilder,
    types::{Creator, DataV2},
};

use crate::{
    error::DawnError,
    state::{Config, TokenConfig},
    TokenConfigInitialized,
};

use super::DawnApp;

const DECIMALS: u8 = 6;
const DENOMINATOR: u64 = 10_u64.pow(DECIMALS as u32);
const MINT_AMOUNT: u64 = 1_000_000_000 * DENOMINATOR;

// DAWN token metadata
const TOKEN_NAME: &str = "DAWN";
const TOKEN_SYMBOL: &str = "DAWN";
const TOKEN_URI: &str =
    "https://raw.githubusercontent.com/DAWN-Foundation/metadata/master/metadata.json";

#[derive(Accounts)]
pub struct InitializeToken<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The token config account that owns the DAWN mint
    #[account(
        init,
        payer = caller,
        space = TokenConfig::SIZE,
        seeds = [TokenConfig::SEED_PREFIX.as_ref()],
        bump
    )]
    pub token_config: Account<'info, TokenConfig>,

    /// The DAWN mint account
    #[account(
        init,
        payer = caller,
        mint::decimals = DECIMALS,
        mint::authority = token_config,
        seeds = [b"dawn"],
        bump
    )]
    pub dawn_mint: Account<'info, Mint>,

    /// The DAWN token account of the caller
    #[account(
        init,
        payer = caller,
        associated_token::mint = dawn_mint,
        associated_token::authority = caller,
    )]
    pub caller_dawn_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeMetadata<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The token config account that owns the DAWN mint
    #[account(
        mut,
        seeds = [TokenConfig::SEED_PREFIX.as_ref()],
        bump = token_config.bump,
    )]
    pub token_config: Account<'info, TokenConfig>,

    /// The config account
    #[account(
        constraint = config.authority == caller.key() @ DawnError::Unauthorized,
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// The DAWN mint account
    #[account(
        seeds = [b"dawn"],
        bump = token_config.mint_bump,
    )]
    pub dawn_mint: Account<'info, Mint>,

    /// The metadata account
    /// CHECK: This is the metadata account that will be created
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    /// The token metadata program
    /// CHECK: This is the token metadata program
    pub token_metadata_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn init_token(ctx: Context<InitializeToken>) -> Result<()> {
        let token_config = &mut ctx.accounts.token_config;

        // construct the signer seeds
        let seeds = &[TokenConfig::SEED_PREFIX.as_ref(), &[ctx.bumps.token_config]];
        let signer_seeds = &[&seeds[..]];

        // construct the cpi accounts
        let cpi_accounts_mint = MintTo {
            mint: ctx.accounts.dawn_mint.to_account_info(),
            to: ctx.accounts.caller_dawn_account.to_account_info(),
            authority: token_config.to_account_info(),
        };

        // construct the cpi context
        let cpi_ctx_mint = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts_mint,
            signer_seeds,
        );

        // Mint DAWN tokens to the caller
        token::mint_to(cpi_ctx_mint, MINT_AMOUNT)?;

        // set the token config
        token_config.created_at = Clock::get()?.unix_timestamp;
        token_config.dawn_mint = ctx.accounts.dawn_mint.key();
        token_config.mint_bump = ctx.bumps.dawn_mint;
        token_config.bump = ctx.bumps.token_config;

        emit!(TokenConfigInitialized {
            token_config: token_config.key(),
            dawn_mint: token_config.dawn_mint,
            created_at: token_config.created_at,
        });

        Ok(())
    }

    pub fn init_metadata(ctx: Context<InitializeMetadata>) -> Result<()> {
        let token_config = &ctx.accounts.token_config;
        let dawn_mint = &ctx.accounts.dawn_mint;

        // Create metadata
        let creators = vec![Creator {
            address: token_config.key(),
            verified: true,
            share: 100,
        }];

        let data_v2 = DataV2 {
            name: TOKEN_NAME.to_string(),
            symbol: TOKEN_SYMBOL.to_string(),
            uri: TOKEN_URI.to_string(),
            seller_fee_basis_points: 0,
            creators: Some(creators),
            collection: None,
            uses: None,
        };

        // Construct the signer seeds
        let seeds = &[b"token".as_ref(), &[token_config.bump]];
        let signer_seeds = &[&seeds[..]];

        // Create metadata using CPI builder
        CreateMetadataAccountV3CpiBuilder::new(&ctx.accounts.token_metadata_program)
            .metadata(&ctx.accounts.metadata.to_account_info())
            .mint(&dawn_mint.to_account_info())
            .mint_authority(&ctx.accounts.token_config.to_account_info())
            .payer(&ctx.accounts.caller.to_account_info())
            .update_authority(&ctx.accounts.token_config.to_account_info(), true)
            .is_mutable(true)
            .data(data_v2)
            .system_program(&ctx.accounts.system_program.to_account_info())
            .invoke_signed(signer_seeds)?;

        Ok(())
    }
}
