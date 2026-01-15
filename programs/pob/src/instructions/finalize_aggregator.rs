use anchor_lang::prelude::*;

use crate::error::PobError;
use crate::events::AggregatorFinalized;
use crate::state::{Aggregator, Prover, RoundCommitment};

#[derive(Accounts)]
#[instruction(da_snapshot_pointer: [u8; 32])]
pub struct FinalizeAggregator<'info> {
    #[account(mut)]
    pub prover_authority: Signer<'info>,

    /// The round commitment account
    #[account(
        seeds = [
            RoundCommitment::SEED_PREFIX.as_ref(),
            &round.seed,
        ],
        bump = round.bump
    )]
    pub round: Box<Account<'info, RoundCommitment>>,

    /// The aggregator account
    #[account(
        mut,
        seeds = [
            Aggregator::SEED_PREFIX.as_ref(),
            round.key().as_ref(),
            prover.key().as_ref(),
        ],
        bump = aggregator.bump
    )]
    pub aggregator: Box<Account<'info, Aggregator>>,

    /// The prover account
    #[account(
        seeds = [
            Prover::SEED_PREFIX.as_ref(),
            prover.authority.as_ref(),
        ],
        bump = prover.bump,
        constraint = prover.authority == prover_authority.key() @ PobError::Unauthorized,
        constraint = prover.unstake_requested_slot == 0 @ PobError::ProverUnstaking,
    )]
    pub prover: Box<Account<'info, Prover>>,
}

pub fn handler(ctx: Context<FinalizeAggregator>, da_snapshot_pointer: [u8; 32]) -> Result<()> {
    let current_slot = Clock::get()?.slot;
    let round = &ctx.accounts.round;
    let aggregator = &mut ctx.accounts.aggregator;

    // Check if round has ended
    require!(current_slot > round.end_slot, PobError::RoundNotActive);

    // Check if aggregator is already finalized
    require!(!aggregator.finalized, PobError::AggregatorAlreadyFinalized);

    // Check if there are any submissions
    require!(
        aggregator.num_submissions > 0,
        PobError::InvalidRoundParameters
    );

    // Calculate average n_est
    let average_n_est_scaled = aggregator
        .sum_n_est_scaled
        .checked_div(aggregator.num_submissions as u128)
        .ok_or(PobError::Overflow)?;

    // Calculate p_hat = min(1, average(n_est)/N)
    let n_packets_scaled = (round.n_packets as u128)
        .checked_mul(1_000_000_000_000)
        .ok_or(PobError::Overflow)?;

    let p_hat_scaled = average_n_est_scaled
        .checked_mul(1_000_000_000_000)
        .and_then(|x| x.checked_div(n_packets_scaled))
        .ok_or(PobError::Overflow)?;

    // Cap at 1.0 (1e12)
    let final_p_hat_scaled = p_hat_scaled.min(1_000_000_000_000);

    // Finalize aggregator
    aggregator.finalized = true;
    aggregator.finalized_p_hat_scaled = final_p_hat_scaled;

    emit!(AggregatorFinalized {
        aggregator: aggregator.key(),
        round: round.key(),
        prover: ctx.accounts.prover.key(),
        p_hat_scaled: final_p_hat_scaled,
        num_submissions: aggregator.num_submissions,
        da_snapshot_pointer,
        finalized_at_slot: current_slot,
    });

    Ok(())
}
