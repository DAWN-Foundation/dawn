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
    /// The DAWN mint account
    pub dawn_mint: Pubkey,
    /// The mint bump seed
    pub mint_bump: u8,
    /// The token config bump seed
    pub bump: u8,
}

const TOKEN_CONFIG_SIZE: usize = 8 // id
    + 32 // dawn_mint
    + 1 // mint_bump
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

impl DawnApp {
    pub fn init_token(ctx: Context<InitializeToken>) -> Result<()> {
        let token_config = &mut ctx.accounts.token_config;

        // mint the token
        let seeds = &[b"token".as_ref(), &[ctx.bumps.token_config]];
        let signer_seeds = &[&seeds[..]];
        let cpi_accounts_mint = MintTo {
            mint: ctx.accounts.dawn_mint.to_account_info(),
            to: ctx.accounts.caller_dawn_account.to_account_info(),
            authority: token_config.to_account_info(),
        };
        let cpi_ctx_mint = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts_mint,
            signer_seeds,
        );
        // Mint 1 billion DAWN tokens
        token::mint_to(cpi_ctx_mint, MINT_AMOUNT)?;

        // bumps
        token_config.dawn_mint = ctx.accounts.dawn_mint.key();
        token_config.mint_bump = ctx.bumps.dawn_mint;
        token_config.bump = ctx.bumps.token_config;

        Ok(())
    }
}
