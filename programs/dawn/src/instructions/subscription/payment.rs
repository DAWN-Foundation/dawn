use crate::error::*;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use raydium_cp_swap::cpi;
use raydium_cp_swap::program::RaydiumCpSwap;
use raydium_cp_swap::states::{PoolState, Q32};

use super::{DawnApp, Subscription};
use crate::{
    constants::BPS_DENOMINATOR,
    error::DawnError,
    instructions::{Config, Plan},
    utils::{sort_accounts, swap_amounts},
};

#[derive(Clone)]
pub struct PaymentAccounts<'info, 'a> {
    pub caller: &'a Signer<'info>,
    pub config: &'a AccountInfo<'info>,
    pub plan: &'a Box<Account<'info, Plan>>,
    pub subscription: &'a Box<Account<'info, Subscription>>,
    pub raydium_pool: &'a AccountLoader<'info, PoolState>,
    pub raydium_authority: &'a UncheckedAccount<'info>,
    pub raydium_config: &'a UncheckedAccount<'info>,
    pub raydium_observation: &'a UncheckedAccount<'info>,
    pub usdc_mint: &'a Box<Account<'info, Mint>>,
    pub dawn_mint: &'a Box<Account<'info, Mint>>,
    pub raydium: &'a Program<'info, RaydiumCpSwap>,
    pub raydium_usdc_vault: &'a Box<Account<'info, TokenAccount>>,
    pub raydium_dawn_vault: &'a Box<Account<'info, TokenAccount>>,
    pub user_usdc_account: &'a Box<Account<'info, TokenAccount>>,
    pub user_dawn_account: &'a Box<Account<'info, TokenAccount>>,
    pub dao_dawn_account: &'a Box<Account<'info, TokenAccount>>,
    pub validator_dawn_account: &'a Box<Account<'info, TokenAccount>>,
    pub medallion_dawn_account: &'a Box<Account<'info, TokenAccount>>,
    pub escrow_usdc_vault: &'a Box<Account<'info, TokenAccount>>,
    pub escrow_dawn_vault: &'a Box<Account<'info, TokenAccount>>,
    pub token_program: &'a Program<'info, Token>,
    pub associated_token_program: &'a Program<'info, AssociatedToken>,
    pub system_program: &'a Program<'info, System>,
}

impl DawnApp {
    pub(super) fn calculate_usdc_fee(
        source: u64,
        dao_fee_bps: u64,
        validator_fee_bps: u64,
        medallion_fee_bps: u64,
        plan_duration: u16,
    ) -> Result<(u64, u64, u64)> {
        let dao_usdc_fee = source
            .checked_mul(dao_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(DawnError::Underflow)?;

        let validator_usdc_fee = source
            .checked_mul(validator_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(DawnError::Underflow)?;

        let medallion_usdc_fee = source
            .checked_mul(medallion_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(DawnError::Underflow)?;

        let total_usdc_fee = dao_usdc_fee
            .checked_add(validator_usdc_fee)
            .ok_or(DawnError::Overflow)?
            .checked_add(medallion_usdc_fee)
            .ok_or(DawnError::Overflow)?;

        let remainder = source.saturating_sub(total_usdc_fee);

        let daily_dawn_in_usdc = remainder
            .checked_div(plan_duration as u64)
            .ok_or(DawnError::Underflow)?;

        let escrow_usdc_remainder = remainder.saturating_sub(daily_dawn_in_usdc);

        Ok((total_usdc_fee, daily_dawn_in_usdc, escrow_usdc_remainder))
    }

    pub(super) fn calculate_dawn_fees(
        total_dawn: u64,
        escrow_dawn_in_usdc: u64,
        price: u128,
        dao_fee_bps: u64,
        validator_fee_bps: u64,
        medallion_fee_bps: u64,
    ) -> Result<(u64, u64, u64, u64)> {
        // Calculate escrow DAWN amount based on the USDC amount and price
        let escrow_dawn = (escrow_dawn_in_usdc as u128)
            .checked_mul(price)
            .ok_or(DawnError::Overflow)?
            .checked_div(Q32)
            .ok_or(DawnError::Underflow)? as u64;

        // The remaining DAWN is for fees
        let remaining_dawn = total_dawn.saturating_sub(escrow_dawn);

        // Calculate total fee basis points
        let total_fee_bps = dao_fee_bps + validator_fee_bps + medallion_fee_bps;

        // Calculate each fee based on the total source amount
        let dao_dawn_fee = remaining_dawn
            .checked_mul(dao_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(total_fee_bps)
            .ok_or(DawnError::Underflow)?;

        let validator_dawn_fee = remaining_dawn
            .checked_mul(validator_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(total_fee_bps)
            .ok_or(DawnError::Underflow)?;

        let medallion_dawn_fee = remaining_dawn
            .checked_mul(medallion_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(total_fee_bps)
            .ok_or(DawnError::Underflow)?;

        Ok((
            dao_dawn_fee,
            validator_dawn_fee,
            medallion_dawn_fee,
            escrow_dawn,
        ))
    }

    pub(super) fn process_payment(
        accounts: PaymentAccounts,
        config: &Config,
        plan: &Plan,
    ) -> Result<(u64, u64, u128)> {
        let (pool_mint_0, pool_mint_1, pool_vault_0, pool_vault_1) = {
            let pool_state = accounts.raydium_pool.load()?;
            (
                pool_state.token_0_mint,
                pool_state.token_1_mint,
                pool_state.token_0_vault,
                pool_state.token_1_vault,
            )
        };

        // Determine input and output tokens and vaults
        let (
            input_mint,
            input_vault,
            input_token_account,
            output_mint,
            output_vault,
            output_token_account,
            is_usdc_base,
        ) = sort_accounts(
            pool_mint_0,
            pool_mint_1,
            pool_vault_0,
            pool_vault_1,
            accounts.usdc_mint.to_account_info(),
            accounts.dawn_mint.to_account_info(),
            accounts.raydium_usdc_vault.to_account_info(),
            accounts.raydium_dawn_vault.to_account_info(),
            accounts.user_usdc_account.to_account_info(),
            accounts.user_dawn_account.to_account_info(),
        )?;

        // calculate the total USDC fee and remainder
        let (total_usdc_fee, daily_dawn_in_usdc, escrow_usdc_remainder) =
            Self::calculate_usdc_fee(
                plan.price,
                config.dao_fee,
                config.validator_fee,
                config.medallion_fee,
                plan.duration,
            )?;

        // Calculate swap amounts in USDC
        let usdc_to_swap = total_usdc_fee.saturating_add(daily_dawn_in_usdc);
        let (usdc_amount_in, minimum_dawn_amount_out, price) = swap_amounts(
            &accounts.raydium_pool,
            &accounts.raydium_usdc_vault,
            &accounts.raydium_dawn_vault,
            is_usdc_base,
            usdc_to_swap,
        )?;

        // Create CPI accounts for the swap
        let swap_cpi = cpi::accounts::Swap {
            payer: accounts.caller.to_account_info(),
            authority: accounts.raydium_authority.to_account_info(),
            amm_config: accounts.raydium_config.to_account_info(),
            pool_state: accounts.raydium_pool.to_account_info(),
            input_token_account,
            output_token_account,
            input_vault,
            output_vault,
            input_token_mint: input_mint,
            output_token_mint: output_mint,
            input_token_program: accounts.token_program.to_account_info(),
            output_token_program: accounts.token_program.to_account_info(),
            observation_state: accounts.raydium_observation.to_account_info(),
        };
        let swap_cpi_ctx = CpiContext::new(accounts.raydium.to_account_info(), swap_cpi);

        if is_usdc_base {
            // USDC is the base token; use swap_base_input
            cpi::swap_base_input(swap_cpi_ctx, usdc_amount_in, minimum_dawn_amount_out)?;
        } else {
            // USDC is the quote token; use swap_base_output
            cpi::swap_base_output(swap_cpi_ctx, usdc_amount_in, minimum_dawn_amount_out)?;
        }

        let (dao_dawn_fee, validator_dawn_fee, medallion_dawn_fee, escrow_dawn) =
            Self::calculate_dawn_fees(
                minimum_dawn_amount_out,
                daily_dawn_in_usdc,
                price,
                config.dao_fee,
                config.validator_fee,
                config.medallion_fee,
            )?;

        // Transfer DAO DAWN fee from user to DAWN DAO
        let dao_fee_cpi_ctx = CpiContext::new(
            accounts.token_program.to_account_info(),
            token::Transfer {
                from: accounts.user_dawn_account.to_account_info(),
                to: accounts.dao_dawn_account.to_account_info(),
                authority: accounts.caller.to_account_info(),
            },
        );
        token::transfer(dao_fee_cpi_ctx, dao_dawn_fee)?;

        // Transfer Validator DAWN fee from user to Validator pool
        let validator_fee_cpi_ctx = CpiContext::new(
            accounts.token_program.to_account_info(),
            token::Transfer {
                from: accounts.user_dawn_account.to_account_info(),
                to: accounts.validator_dawn_account.to_account_info(),
                authority: accounts.caller.to_account_info(),
            },
        );
        token::transfer(validator_fee_cpi_ctx, validator_dawn_fee)?;

        // Transfer Medallion DAWN fee from user to Medallion pool
        let medallion_fee_cpi_ctx = CpiContext::new(
            accounts.token_program.to_account_info(),
            token::Transfer {
                from: accounts.user_dawn_account.to_account_info(),
                to: accounts.medallion_dawn_account.to_account_info(),
                authority: accounts.caller.to_account_info(),
            },
        );
        token::transfer(medallion_fee_cpi_ctx, medallion_dawn_fee)?;

        // Deposit escrow DAWN into escrow DAWN vault
        let escrow_dawn_cpi_ctx = CpiContext::new(
            accounts.token_program.to_account_info(),
            token::Transfer {
                from: accounts.user_dawn_account.to_account_info(),
                to: accounts.escrow_dawn_vault.to_account_info(),
                authority: accounts.caller.to_account_info(),
            },
        );
        token::transfer(escrow_dawn_cpi_ctx, escrow_dawn)?;

        // Deposit remainder into escrow USDC vault
        let remainder_cpi_ctx = CpiContext::new(
            accounts.token_program.to_account_info(),
            token::Transfer {
                from: accounts.user_usdc_account.to_account_info(),
                to: accounts.escrow_usdc_vault.to_account_info(),
                authority: accounts.caller.to_account_info(),
            },
        );
        token::transfer(remainder_cpi_ctx, escrow_usdc_remainder)?;

        // Return claimable_dawn and daily_usdc for the subscription and swap price
        Ok((escrow_dawn, daily_dawn_in_usdc, price))
    }
}
