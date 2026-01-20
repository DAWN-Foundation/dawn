use anchor_lang::prelude::*;

use crate::error::PobError;
use crate::state::{Aggregator, Prover};

#[derive(Accounts)]
pub struct CloseAggregator<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,

    /// The prover account - validates authority
    #[account(
        seeds = [
            Prover::SEED_PREFIX.as_ref(),
            prover.authority.as_ref(),
        ],
        bump = prover.bump,
        constraint = prover.key() == aggregator.prover @ PobError::WrongProver,
        constraint = prover.authority == beneficiary.key() @ PobError::Unauthorized,
    )]
    pub prover: Box<Account<'info, Prover>>,

    /// The aggregator account
    #[account(
        mut,
        close = beneficiary,
        seeds = [
            Aggregator::SEED_PREFIX.as_ref(),
            aggregator.round.as_ref(),
            aggregator.prover.as_ref(),
        ],
        bump = aggregator.bump
    )]
    pub aggregator: Box<Account<'info, Aggregator>>,
}

pub fn handler(ctx: Context<CloseAggregator>) -> Result<()> {
    let aggregator = &ctx.accounts.aggregator;

    // Check if aggregator is finalized
    require!(aggregator.finalized, PobError::AggregatorNotFinalized);

    Ok(())
}
