use anchor_lang::prelude::*;

use crate::{
    state::Aggregator,
    DawnApp, DawnError,
};

#[derive(Accounts)]
pub struct CloseAggregator<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,

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

impl DawnApp {
    pub fn close_aggregator(ctx: Context<CloseAggregator>) -> Result<()> {
        let aggregator = &ctx.accounts.aggregator;

        // Check if aggregator is finalized
        require!(aggregator.finalized, DawnError::AggregatorAlreadyFinalized);

        Ok(())
    }
}

