use anchor_lang::prelude::*;

use crate::error::PobError;
use crate::state::{Aggregator, Prover, Receipt};

#[derive(Accounts)]
pub struct CloseReceipt<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,

    /// The prover account - validates authority
    #[account(
        seeds = [
            Prover::SEED_PREFIX.as_ref(),
            prover.authority.as_ref(),
        ],
        bump = prover.bump,
        constraint = prover.key() == receipt.prover @ PobError::WrongProver,
        constraint = prover.authority == beneficiary.key() @ PobError::Unauthorized,
    )]
    pub prover: Box<Account<'info, Prover>>,

    /// The receipt account to close
    #[account(
        mut,
        close = beneficiary,
        seeds = [
            Receipt::SEED_PREFIX.as_ref(),
            receipt.round.as_ref(),
            receipt.prover.as_ref(),
            &receipt.min_token,
        ],
        bump = receipt.bump
    )]
    pub receipt: Box<Account<'info, Receipt>>,

    /// The aggregator must be finalized before receipts can be closed
    #[account(
        seeds = [
            Aggregator::SEED_PREFIX.as_ref(),
            receipt.round.as_ref(),
            receipt.prover.as_ref(),
        ],
        bump = aggregator.bump,
        constraint = aggregator.finalized @ PobError::AggregatorNotFinalized,
    )]
    pub aggregator: Box<Account<'info, Aggregator>>,
}

pub fn handler(_ctx: Context<CloseReceipt>) -> Result<()> {
    // Validation is handled by account constraints:
    // - Receipt PDA is verified
    // - Aggregator must exist and be finalized
    Ok(())
}
