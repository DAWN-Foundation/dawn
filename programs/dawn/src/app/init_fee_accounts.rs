use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::TokenConfig;

use super::DawnApp;

#[derive(Accounts)]
pub struct InitializeFeeAccounts<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The token config account that owns the DAWN mint
    #[account(
        mut,
        seeds = [TokenConfig::SEED_PREFIX.as_ref()],
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
    pub fn init_fee_accounts(ctx: Context<InitializeFeeAccounts>) -> Result<()> {
        let token_config = &mut ctx.accounts.token_config;

        token_config.fee_pool_bump = ctx.bumps.fee_pool_dawn_account;
        token_config.dao_bump = ctx.bumps.dao_dawn_account;
        token_config.validator_bump = ctx.bumps.validator_dawn_account;
        token_config.medallion_bump = ctx.bumps.medallion_dawn_account;

        Ok(())
    }
}
