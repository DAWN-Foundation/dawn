use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};

use crate::state::TokenConfig;

use super::DawnApp;

const DECIMALS: u8 = 6;
const DENOMINATOR: u64 = 10_u64.pow(DECIMALS as u32);
const MINT_AMOUNT: u64 = 1_000_000_000 * DENOMINATOR;

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

        Ok(())
    }
}
