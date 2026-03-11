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
    pub stable_mint: &'a Account<'info, Mint>,
    pub dawn_mint: &'a Account<'info, Mint>,
    pub raydium: &'a Program<'info, RaydiumCpSwap>,
    pub raydium_stable_vault: &'a Account<'info, TokenAccount>,
    pub raydium_dawn_vault: &'a Account<'info, TokenAccount>,
    pub user_stable_account: &'a Account<'info, TokenAccount>,
    pub user_dawn_account: &'a mut Account<'info, TokenAccount>,
    pub fee_pool_dawn_account: &'a Account<'info, TokenAccount>,
    pub escrow_stable_vault: &'a Account<'info, TokenAccount>,
    pub escrow_dawn_vault: &'a Account<'info, TokenAccount>,
    pub token_program: &'a Program<'info, Token>,
}

pub(super) fn calculate_stable_fee(
    source: u64,
    dao_fee_bps: u64,
    validator_fee_bps: u64,
    medallion_fee_bps: u64,
    plan_duration: u16,
) -> Result<(u64, u64, u64)> {
    // Use u128 for intermediate calculations to prevent overflow
    let source_u128 = source as u128;
    let bps_denom_u128 = BPS_DENOMINATOR as u128;

    // Calculate individual fees using u128 arithmetic
    let dao_stable_fee_u128 = source_u128
        .checked_mul(dao_fee_bps as u128)
        .ok_or(DawnError::Overflow)?
        .checked_div(bps_denom_u128)
        .ok_or(DawnError::Underflow)?;

    let validator_stable_fee_u128 = source_u128
        .checked_mul(validator_fee_bps as u128)
        .ok_or(DawnError::Overflow)?
        .checked_div(bps_denom_u128)
        .ok_or(DawnError::Underflow)?;

    let medallion_stable_fee_u128 = source_u128
        .checked_mul(medallion_fee_bps as u128)
        .ok_or(DawnError::Overflow)?
        .checked_div(bps_denom_u128)
        .ok_or(DawnError::Underflow)?;

    // Convert back to u64 with overflow checks
    let dao_stable_fee = u64::try_from(dao_stable_fee_u128).map_err(|_| DawnError::Overflow)?;
    let validator_stable_fee =
        u64::try_from(validator_stable_fee_u128).map_err(|_| DawnError::Overflow)?;
    let medallion_stable_fee =
        u64::try_from(medallion_stable_fee_u128).map_err(|_| DawnError::Overflow)?;

    let total_stable_fee = dao_stable_fee
        .checked_add(validator_stable_fee)
        .ok_or(DawnError::Overflow)?
        .checked_add(medallion_stable_fee)
        .ok_or(DawnError::Overflow)?;

    // Validate total fee doesn't exceed source
    require!(total_stable_fee <= source, DawnError::InsufficientFunds);

    let remainder = source.saturating_sub(total_stable_fee);

    let daily_dawn_in_stable = remainder
        .checked_div(plan_duration as u64)
        .ok_or(DawnError::Underflow)?;

    require!(daily_dawn_in_stable > 0, DawnError::DailySwapTooSmall);

    let escrow_stable_remainder = remainder.saturating_sub(daily_dawn_in_stable);

    Ok((
        total_stable_fee,
        daily_dawn_in_stable,
        escrow_stable_remainder,
    ))
}

/// Calculate DAWN fee and escrow amounts proportionally from actual swap output                                                                               
pub(super) fn calculate_dawn_fees_proportional(
    actual_dawn_out: u64,
    daily_stable: u64,
    total_stable: u64,
) -> Result<(u64, u64)> {
    // Prevent division by zero
    require!(total_stable > 0, DawnError::InvalidAmount);

    // Calculate escrow portion using checked math
    let escrow_dawn = u64::try_from(
        (actual_dawn_out as u128)
            .checked_mul(daily_stable as u128)
            .ok_or(DawnError::Overflow)?
            .checked_div(total_stable as u128)
            .ok_or(DawnError::Underflow)?,
    )
    .map_err(|_| DawnError::Overflow)?;

    // Fee is remainder
    let total_dawn_fee = actual_dawn_out
        .checked_sub(escrow_dawn)
        .ok_or(DawnError::Underflow)?;

    Ok((total_dawn_fee, escrow_dawn))
}

/// Execute a USD.tel to DAWN swap via Raydium with slippage protection
/// Returns the actual DAWN output amount
fn execute_stable_to_dawn_swap(
    accounts: &mut PaymentAccounts,
    stable_amount_to_swap: u64,
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
        is_stable_base,
    ) = sort_accounts(
        pool_mint_0,
        pool_mint_1,
        pool_vault_0,
        pool_vault_1,
        accounts.stable_mint.to_account_info(),
        accounts.dawn_mint.to_account_info(),
        accounts.raydium_stable_vault.to_account_info(),
        accounts.raydium_dawn_vault.to_account_info(),
        accounts.user_stable_account.to_account_info(),
        accounts.user_dawn_account.to_account_info(),
    )?;

    // Calculate swap amounts
    let (stable_amount_in, expected_dawn_out) = swap_amounts(
        accounts.raydium_pool,
        accounts.raydium_stable_vault,
        accounts.raydium_dawn_vault,
        is_stable_base,
        stable_amount_to_swap,
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
    cpi::swap_base_input(swap_cpi_ctx, stable_amount_in, min_dawn_out)?;

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
/// - Swaps fees + first day's worth to DAWN
/// - Fee portion goes to fee pool, first day's DAWN goes to escrow
/// - Remaining USD.tel goes to escrow for future daily claims
///
/// Note: min_dawn_out should be calculated for full plan.price.
/// The program scales it proportionally for the actual swap amount.
/// Returns: (escrow_dawn, daily_stable, actual_dawn_out)
pub(super) fn process_payment(
    mut accounts: PaymentAccounts,
    config: &Config,
    plan: &Plan,
    min_dawn_out: u64,
) -> Result<(u64, u64, u64)> {
    // Calculate the total USD.tel fee and remainder
    let (total_stable_fee, daily_dawn_in_stable, escrow_stable_remainder) = calculate_stable_fee(
        plan.price,
        config.dao_fee,
        config.validator_fee,
        config.medallion_fee,
        plan.duration,
    )?;

    // Calculate total USD.tel to swap (fees + first day)
    let stable_to_swap = total_stable_fee.saturating_add(daily_dawn_in_stable);

    // Scale min_dawn_out proportionally since we're only swapping a portion
    // User provides min_dawn_out for full plan.price, but we only swap stable_to_swap
    let scaled_min_dawn_out = u64::try_from(
        (min_dawn_out as u128)
            .checked_mul(stable_to_swap as u128)
            .ok_or(DawnError::Overflow)?
            .checked_div(plan.price as u128)
            .ok_or(DawnError::Underflow)?,
    )
    .map_err(|_| DawnError::Overflow)?;

    // Execute swap via Raydium
    let actual_dawn_out =
        execute_stable_to_dawn_swap(&mut accounts, stable_to_swap, scaled_min_dawn_out)?;

    // Calculate fees proportionally from ACTUAL output
    let stable_total = total_stable_fee
        .checked_add(daily_dawn_in_stable)
        .ok_or(DawnError::Overflow)?;

    let (total_dawn_fee, escrow_dawn) =
        calculate_dawn_fees_proportional(actual_dawn_out, daily_dawn_in_stable, stable_total)?;

    // Transfer total DAWN fee from user to fee pool DAWN account
    let fee_pool_cpi_ctx = CpiContext::new(
        accounts.token_program.to_account_info(),
        token::Transfer {
            from: accounts.user_dawn_account.to_account_info(),
            to: accounts.fee_pool_dawn_account.to_account_info(),
            authority: accounts.caller.to_account_info(),
        },
    );
    token::transfer(fee_pool_cpi_ctx, total_dawn_fee)?;

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

    // Deposit remainder into escrow USD.tel vault
    let remainder_cpi_ctx = CpiContext::new(
        accounts.token_program.to_account_info(),
        token::Transfer {
            from: accounts.user_stable_account.to_account_info(),
            to: accounts.escrow_stable_vault.to_account_info(),
            authority: accounts.caller.to_account_info(),
        },
    );
    token::transfer(remainder_cpi_ctx, escrow_stable_remainder)?;

    // Return claimable_dawn, daily_stable, and actual DAWN output
    Ok((escrow_dawn, daily_dawn_in_stable, actual_dawn_out))
}

/// Process payment for active subscription extension
/// - Swaps only fees to DAWN (sent to fee pool immediately)
/// - Remaining USD.tel goes to escrow for future daily claims
///
/// Note: min_dawn_out should be calculated for full plan.price.
/// The program scales it proportionally for the actual swap amount.
/// Returns: (daily_stable, actual_dawn_out)
pub(super) fn process_extension_payment(
    mut accounts: PaymentAccounts,
    config: &Config,
    plan: &Plan,
    min_dawn_out: u64,
) -> Result<(u64, u64)> {
    // Calculate fee breakdown
    let (total_stable_fee, daily_dawn_in_stable, escrow_stable_remainder) = calculate_stable_fee(
        plan.price,
        config.dao_fee,
        config.validator_fee,
        config.medallion_fee,
        plan.duration,
    )?;

    // Scale min_dawn_out proportionally since we're only swapping the fee portion
    // User provides min_dawn_out for full plan.price, but we only swap total_stable_fee
    let scaled_min_dawn_out = u64::try_from(
        (min_dawn_out as u128)
            .checked_mul(total_stable_fee as u128)
            .ok_or(DawnError::Overflow)?
            .checked_div(plan.price as u128)
            .ok_or(DawnError::Underflow)?,
    )
    .map_err(|_| DawnError::Overflow)?;

    // Execute swap via Raydium (only swap the fee portion)
    let actual_dawn_out =
        execute_stable_to_dawn_swap(&mut accounts, total_stable_fee, scaled_min_dawn_out)?;

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

    // Transfer non-fee USD.tel to escrow (for future daily claims)
    let stable_to_escrow = escrow_stable_remainder
        .checked_add(daily_dawn_in_stable)
        .ok_or(DawnError::Overflow)?;

    let escrow_cpi_ctx = CpiContext::new(
        accounts.token_program.to_account_info(),
        token::Transfer {
            from: accounts.user_stable_account.to_account_info(),
            to: accounts.escrow_stable_vault.to_account_info(),
            authority: accounts.caller.to_account_info(),
        },
    );
    token::transfer(escrow_cpi_ctx, stable_to_escrow)?;

    // Return daily_stable and actual DAWN output from fee swap
    Ok((daily_dawn_in_stable, actual_dawn_out))
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
