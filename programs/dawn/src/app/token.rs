use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};

use super::DawnApp;

const DECIMALS: u8 = 6;
const DENOMINATOR: u64 = 10_u64.pow(DECIMALS as u32);
const MINT_AMOUNT: u64 = 1_000_000_000 * DENOMINATOR;

#[account]
pub struct TokenConfig {
    /// The creation timestamp
    pub created_at: i64,
    /// The DAWN mint account
    pub dawn_mint: Pubkey,
    /// The mint bump seed
    pub mint_bump: u8,
    /// The fee pool bump seed
    pub fee_pool_bump: u8,
    /// The DAO bump seed
    pub dao_bump: u8,
    /// The validator bump seed
    pub validator_bump: u8,
    /// The medallion bump seed
    pub medallion_bump: u8,
    /// The token config bump seed
    pub bump: u8,
}

const TOKEN_CONFIG_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // dawn_mint
    + 1 // mint_bump
    + 1 // fee_pool_bump
    + 1 // dao_bump
    + 1 // validator_bump
    + 1 // medallion_bump
    + 1; // bump

#[derive(Accounts)]
pub struct InitializeToken<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The token config account that owns the DAWN mint
    #[account(
        init,
        payer = caller,
        space = TOKEN_CONFIG_SIZE,
        seeds = [b"token"],
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
pub struct InitializeFeeAccounts<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The token config account that owns the DAWN mint
    #[account(
        mut,
        seeds = [b"token"],
        bump = token_config.bump,
    )]
    pub token_config: Account<'info, TokenConfig>,

    /// The DAWN mint account
    #[account(
        seeds = [b"dawn"],
        bump = token_config.mint_bump,
    )]
    pub dawn_mint: Account<'info, Mint>,

    /// The fee pool DAWN token account
    #[account(
        init,
        payer = caller,
        token::mint = dawn_mint,
        token::authority = token_config,
        seeds = [b"fee_pool_dawn_account"],
        bump,
    )]
    pub fee_pool_dawn_account: Account<'info, TokenAccount>,

    /// The DAWN DAO DAWN token account
    #[account(
        init,
        payer = caller,
        token::mint = dawn_mint,
        token::authority = token_config,
        seeds = [b"dao_dawn_account"],
        bump,
    )]
    pub dao_dawn_account: Box<Account<'info, TokenAccount>>,

    /// The validator DAWN pool token account
    #[account(
        init,
        payer = caller,
        token::mint = dawn_mint,
        token::authority = token_config,
        seeds = [b"validator_dawn_account"],
        bump,
    )]
    pub validator_dawn_account: Box<Account<'info, TokenAccount>>,

    /// The medallion DAWN pool token account
    #[account(
        init,
        payer = caller,
        token::mint = dawn_mint,
        token::authority = token_config,
        seeds = [b"medallion_dawn_account"],
        bump,
    )]
    pub medallion_dawn_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn init_token(ctx: Context<InitializeToken>) -> Result<()> {
        let token_config = &mut ctx.accounts.token_config;

        // construct the signer seeds
        let seeds = &[b"token".as_ref(), &[ctx.bumps.token_config]];
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

        Ok(())
    }

    pub fn init_fee_accounts(ctx: Context<InitializeFeeAccounts>) -> Result<()> {
        let token_config = &mut ctx.accounts.token_config;

        token_config.fee_pool_bump = ctx.bumps.fee_pool_dawn_account;
        token_config.dao_bump = ctx.bumps.dao_dawn_account;
        token_config.validator_bump = ctx.bumps.validator_dawn_account;
        token_config.medallion_bump = ctx.bumps.medallion_dawn_account;

        Ok(())
    }
}
