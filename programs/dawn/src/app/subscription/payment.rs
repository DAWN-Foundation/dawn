use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use raydium_cp_swap::cpi;
use raydium_cp_swap::program::RaydiumCpSwap;
use raydium_cp_swap::states::PoolState;

use crate::{
    constants::{BPS_DENOMINATOR, MAX_DEADLINE_OFFSET_SECONDS, MAX_SLIPPAGE_TOLERANCE_BPS},
    error::DawnError,
    state::{Config, Plan},
    utils::{sort_accounts, swap_amounts},
};

pub struct PaymentAccounts<'info, 'a> {
    pub caller: &'a Signer<'info>,
    pub raydium_pool: &'a AccountLoader<'info, PoolState>,
    pub raydium_authority: &'a UncheckedAccount<'info>,
    pub raydium_config: &'a UncheckedAccount<'info>,
    pub raydium_observation: &'a UncheckedAccount<'info>,
    pub usdc_mint: &'a Account<'info, Mint>,
    pub dawn_mint: &'a Account<'info, Mint>,
    pub raydium: &'a Program<'info, RaydiumCpSwap>,
    pub raydium_usdc_vault: &'a Account<'info, TokenAccount>,
    pub raydium_dawn_vault: &'a Account<'info, TokenAccount>,
    pub user_usdc_account: &'a Account<'info, TokenAccount>,
    pub user_dawn_account: &'a mut Account<'info, TokenAccount>,
    pub fee_pool_dawn_account: &'a Account<'info, TokenAccount>,
    pub escrow_usdc_vault: &'a Account<'info, TokenAccount>,
    pub token_program: &'a Program<'info, Token>,
}

pub(super) fn calculate_usdc_fee(
    source: u64,
    dao_fee_bps: u64,
    validator_fee_bps: u64,
    medallion_fee_bps: u64,
) -> Result<(u64, u64)> {
    // Use u128 for intermediate calculations to prevent overflow
    let source_u128 = source as u128;
    let bps_denom_u128 = BPS_DENOMINATOR as u128;

    // Calculate individual fees using u128 arithmetic
    let dao_usdc_fee_u128 = source_u128
        .checked_mul(dao_fee_bps as u128)
        .ok_or(DawnError::Overflow)?
        .checked_div(bps_denom_u128)
        .ok_or(DawnError::Underflow)?;

    let validator_usdc_fee_u128 = source_u128
        .checked_mul(validator_fee_bps as u128)
        .ok_or(DawnError::Overflow)?
        .checked_div(bps_denom_u128)
        .ok_or(DawnError::Underflow)?;

    let medallion_usdc_fee_u128 = source_u128
        .checked_mul(medallion_fee_bps as u128)
        .ok_or(DawnError::Overflow)?
        .checked_div(bps_denom_u128)
        .ok_or(DawnError::Underflow)?;

    // Convert back to u64 with overflow checks
    let dao_usdc_fee = u64::try_from(dao_usdc_fee_u128).map_err(|_| DawnError::Overflow)?;
    let validator_usdc_fee =
        u64::try_from(validator_usdc_fee_u128).map_err(|_| DawnError::Overflow)?;
    let medallion_usdc_fee =
        u64::try_from(medallion_usdc_fee_u128).map_err(|_| DawnError::Overflow)?;

    let total_usdc_fee = dao_usdc_fee
        .checked_add(validator_usdc_fee)
        .ok_or(DawnError::Overflow)?
        .checked_add(medallion_usdc_fee)
        .ok_or(DawnError::Overflow)?;

    // Validate total fee doesn't exceed source
    require!(total_usdc_fee <= source, DawnError::InsufficientFunds);

    let escrow_usdc = source.saturating_sub(total_usdc_fee);

    Ok((total_usdc_fee, escrow_usdc))
}

/// Execute a USDC to DAWN swap via Raydium with slippage protection
/// Returns the actual DAWN output amount
fn execute_usdc_to_dawn_swap(
    accounts: &mut PaymentAccounts,
    usdc_amount_to_swap: u64,
    min_dawn_out: u64,
) -> Result<u64> {
    // Get pool configuration
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

    // Calculate swap amounts
    let (usdc_amount_in, expected_dawn_out) = swap_amounts(
        accounts.raydium_pool,
        accounts.raydium_usdc_vault,
        accounts.raydium_dawn_vault,
        is_usdc_base,
        usdc_amount_to_swap,
    )?;

    // Validate min_dawn_out is reasonable: must allow at most MAX_SLIPPAGE_TOLERANCE_BPS slippage
    let min_allowed_output = expected_dawn_out
        .checked_mul(BPS_DENOMINATOR - MAX_SLIPPAGE_TOLERANCE_BPS)
        .ok_or(DawnError::Overflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(DawnError::Underflow)?;

    require!(
        min_dawn_out <= expected_dawn_out && min_dawn_out >= min_allowed_output,
        DawnError::InvalidMinimumOutput
    );

    // Read user DAWN balance before swap
    let user_dawn_before = accounts.user_dawn_account.amount;

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

    // Perform swap
    cpi::swap_base_input(swap_cpi_ctx, usdc_amount_in, min_dawn_out)?;

    // Reload user DAWN account to measure actual output
    accounts.user_dawn_account.reload()?;
    let user_dawn_after = accounts.user_dawn_account.amount;

    let actual_dawn_out = user_dawn_after
        .checked_sub(user_dawn_before)
        .ok_or(DawnError::Underflow)?;

    // Validate actual output meets minimum
    require!(
        actual_dawn_out >= min_dawn_out,
        DawnError::InsufficientOutputAmount
    );

    Ok(actual_dawn_out)
}

/// Process payment for new subscriptions
/// - Swaps only fees to DAWN (sent to fee pool immediately)
/// - Remaining USDC goes to escrow for claim after subscription expires
///
/// Note: min_dawn_out should be calculated for full plan.price.
/// The program scales it proportionally for the actual swap amount.
/// Returns: actual_dawn_out
pub(super) fn process_payment(
    mut accounts: PaymentAccounts,
    config: &Config,
    plan: &Plan,
    min_dawn_out: u64,
) -> Result<u64> {
    // Calculate the total USDC fee and escrow amount
    let (total_usdc_fee, escrow_usdc) = calculate_usdc_fee(
        plan.price,
        config.dao_fee,
        config.validator_fee,
        config.medallion_fee,
    )?;

    // Scale min_dawn_out proportionally since we're only swapping the fee portion
    // User provides min_dawn_out for full plan.price, but we only swap total_usdc_fee
    let scaled_min_dawn_out = u64::try_from(
        (min_dawn_out as u128)
            .checked_mul(total_usdc_fee as u128)
            .ok_or(DawnError::Overflow)?
            .checked_div(plan.price as u128)
            .ok_or(DawnError::Underflow)?,
    )
    .map_err(|_| DawnError::Overflow)?;

    // Execute swap via Raydium (only swap the fee portion)
    let actual_dawn_out =
        execute_usdc_to_dawn_swap(&mut accounts, total_usdc_fee, scaled_min_dawn_out)?;

    // Transfer all swapped DAWN (fees) to fee pool
    let fee_pool_cpi_ctx = CpiContext::new(
        accounts.token_program.to_account_info(),
        token::Transfer {
            from: accounts.user_dawn_account.to_account_info(),
            to: accounts.fee_pool_dawn_account.to_account_info(),
            authority: accounts.caller.to_account_info(),
        },
    );
    token::transfer(fee_pool_cpi_ctx, actual_dawn_out)?;

    // Deposit all non-fee USDC into escrow vault
    let escrow_cpi_ctx = CpiContext::new(
        accounts.token_program.to_account_info(),
        token::Transfer {
            from: accounts.user_usdc_account.to_account_info(),
            to: accounts.escrow_usdc_vault.to_account_info(),
            authority: accounts.caller.to_account_info(),
        },
    );
    token::transfer(escrow_cpi_ctx, escrow_usdc)?;

    // Return actual DAWN output from fee swap
    Ok(actual_dawn_out)
}

/// Process payment for subscription extension
/// - Swaps only fees to DAWN (sent to fee pool immediately)
/// - Remaining USDC goes to escrow for claim after subscription expires
///
/// Note: min_dawn_out should be calculated for full plan.price.
/// The program scales it proportionally for the actual swap amount.
/// Returns: actual_dawn_out
pub(super) fn process_extension_payment(
    mut accounts: PaymentAccounts,
    config: &Config,
    plan: &Plan,
    min_dawn_out: u64,
) -> Result<u64> {
    // Calculate fee breakdown
    let (total_usdc_fee, escrow_usdc) = calculate_usdc_fee(
        plan.price,
        config.dao_fee,
        config.validator_fee,
        config.medallion_fee,
    )?;

    // Scale min_dawn_out proportionally since we're only swapping the fee portion
    // User provides min_dawn_out for full plan.price, but we only swap total_usdc_fee
    let scaled_min_dawn_out = u64::try_from(
        (min_dawn_out as u128)
            .checked_mul(total_usdc_fee as u128)
            .ok_or(DawnError::Overflow)?
            .checked_div(plan.price as u128)
            .ok_or(DawnError::Underflow)?,
    )
    .map_err(|_| DawnError::Overflow)?;

    // Execute swap via Raydium (only swap the fee portion)
    let actual_dawn_out =
        execute_usdc_to_dawn_swap(&mut accounts, total_usdc_fee, scaled_min_dawn_out)?;

    // Transfer all swapped DAWN (fees) to fee pool
    let fee_pool_cpi_ctx = CpiContext::new(
        accounts.token_program.to_account_info(),
        token::Transfer {
            from: accounts.user_dawn_account.to_account_info(),
            to: accounts.fee_pool_dawn_account.to_account_info(),
            authority: accounts.caller.to_account_info(),
        },
    );
    token::transfer(fee_pool_cpi_ctx, actual_dawn_out)?;

    // Transfer non-fee USDC to escrow
    let escrow_cpi_ctx = CpiContext::new(
        accounts.token_program.to_account_info(),
        token::Transfer {
            from: accounts.user_usdc_account.to_account_info(),
            to: accounts.escrow_usdc_vault.to_account_info(),
            authority: accounts.caller.to_account_info(),
        },
    );
    token::transfer(escrow_cpi_ctx, escrow_usdc)?;

    // Return actual DAWN output from fee swap
    Ok(actual_dawn_out)
}

/// Validate deadline hasn't expired and isn't too far in the future
pub(super) fn validate_deadline(current_time: i64, deadline: i64) -> Result<()> {
    require!(current_time <= deadline, DawnError::TransactionExpired);

    let deadline_offset = deadline
        .checked_sub(current_time)
        .ok_or(DawnError::TransactionExpired)?;
    require!(
        deadline_offset <= MAX_DEADLINE_OFFSET_SECONDS,
        DawnError::DeadlineTooFarInFuture
    );

    Ok(())
}
