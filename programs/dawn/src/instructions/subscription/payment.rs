use anchor_lang::prelude::*;
use raydium_cp_swap::states::Q32;

use super::DawnApp;
use crate::{constants::BPS_DENOMINATOR, error::DawnError};

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

        let escrow_dawn_in_usdc = remainder
            .checked_div(plan_duration as u64)
            .ok_or(DawnError::Underflow)?;

        let escrow_usdc_remainder = remainder.saturating_sub(escrow_dawn_in_usdc);

        Ok((total_usdc_fee, escrow_dawn_in_usdc, escrow_usdc_remainder))
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
}
