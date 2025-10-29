use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use raydium_cp_swap::states::{PoolState, Q32};

use crate::DawnError;

#[allow(clippy::too_many_arguments)]
pub fn sort_accounts<'info>(
    pool_mint_0: Pubkey,
    pool_mint_1: Pubkey,
    pool_vault_0: Pubkey,
    pool_vault_1: Pubkey,
    usdc_mint: AccountInfo<'info>,
    dawn_mint: AccountInfo<'info>,
    usdc_vault: AccountInfo<'info>,
    dawn_vault: AccountInfo<'info>,
    user_usdc_account: AccountInfo<'info>,
    user_dawn_account: AccountInfo<'info>,
) -> Result<(
    AccountInfo<'info>, // input_mint
    AccountInfo<'info>, // input_vault
    AccountInfo<'info>, // input_token_account
    AccountInfo<'info>, // output_mint
    AccountInfo<'info>, // output_vault
    AccountInfo<'info>, // output_token_account
    bool,               // is_usdc_base
)> {
    match (
        pool_mint_0 == usdc_mint.key(),
        pool_mint_1 == usdc_mint.key(),
    ) {
        (true, false) => {
            // USDC is token_mint_0, DAWN is token_mint_1
            if pool_mint_1 != dawn_mint.key() {
                return Err(DawnError::InvalidMint.into());
            }
            // Verify vault addresses
            if pool_vault_0 != usdc_vault.key() || pool_vault_1 != dawn_vault.key() {
                return Err(DawnError::InvalidVault.into());
            }
            Ok((
                usdc_mint,
                usdc_vault,
                user_usdc_account,
                dawn_mint,
                dawn_vault,
                user_dawn_account,
                true,
            ))
        }
        (false, true) => {
            // USDC is token_mint_1, DAWN is token_mint_0
            if pool_mint_0 != dawn_mint.key() {
                return Err(DawnError::InvalidMint.into());
            }
            // Verify vault addresses
            if pool_vault_1 != usdc_vault.key() || pool_vault_0 != dawn_vault.key() {
                return Err(DawnError::InvalidVault.into());
            }
            Ok((
                usdc_mint,
                usdc_vault,
                user_usdc_account,
                dawn_mint,
                dawn_vault,
                user_dawn_account,
                false,
            ))
        }
        _ => Err(DawnError::InvalidMint.into()),
    }
}

/// Calculate expected swap amounts for USDC -> DAWN swap
///
/// Returns:
/// - `usdc_amount_in`: The amount of USDC to swap (same as input)
/// - `expected_dawn_out`: The expected DAWN output based on current pool price
///
/// Note: The expected output is calculated from the current pool state and may differ
/// from actual output due to slippage, price movement, or pool updates between
/// calculation and execution.
pub fn swap_amounts<'info>(
    raydium_pool: &AccountLoader<'info, PoolState>,
    raydium_usdc_vault: &Account<'info, TokenAccount>,
    raydium_dawn_vault: &Account<'info, TokenAccount>,
    is_usdc_base: bool,
    usdc_to_swap: u64,
) -> Result<(u64, u64)> {
    let pool = raydium_pool.load()?;

    // sort vaults (usdc and dawn) by key
    let (vault_0, vault_1) = {
        if raydium_dawn_vault.key() == pool.token_0_vault.key() {
            (raydium_dawn_vault, raydium_usdc_vault)
        } else {
            (raydium_usdc_vault, raydium_dawn_vault)
        }
    };

    // Get current vault amounts and calculate price using pool state's method
    let (token_0_price_x32, token_1_price_x32) =
        pool.token_price_x32(vault_0.amount, vault_1.amount);

    let usdc_amount_in = usdc_to_swap;

    // USDC is base, we're calculating DAWN output
    let price = if is_usdc_base && vault_0.key() == raydium_usdc_vault.key() {
        token_0_price_x32
    } else {
        token_1_price_x32
    };

    let expected_out = (usdc_amount_in as u128)
        .checked_mul(price)
        .ok_or(DawnError::Overflow)?
        .checked_div(Q32)
        .ok_or(DawnError::Underflow)? as u64;

    Ok((usdc_amount_in, expected_out))
}
