use anchor_lang::prelude::*;

use crate::{
    events::AggregatorFinalized,
    state::{RoundCommitment, Aggregator, Prover},
    DawnApp, DawnError,
};

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
        bump = prover.bump
    )]
    pub prover: Box<Account<'info, Prover>>,
}

impl DawnApp {
    pub fn finalize_aggregator(
        ctx: Context<FinalizeAggregator>,
        da_snapshot_pointer: [u8; 32],
    ) -> Result<()> {
        let current_slot = Clock::get()?.slot;
        let round = &ctx.accounts.round;
        let aggregator = &mut ctx.accounts.aggregator;

        // Check if round has ended
        // require!(
        //     current_slot > round_commitment.end_slot,
        //     DawnError::RoundNotActive
        // );

        // Check if aggregator is already finalized
        require!(!aggregator.finalized, DawnError::AggregatorAlreadyFinalized);

        // Check if there are any submissions
        require!(aggregator.num_submissions > 0, DawnError::InvalidRoundParameters);

        // Calculate average n_est
        let average_n_est_scaled = aggregator.sum_n_est_scaled
            .checked_div(aggregator.num_submissions as u128)
            .ok_or(DawnError::Overflow)?;

        // Calculate p_hat = min(1, average(n_est)/N)
        let n_packets_scaled = (round.n_packets as u128)
            .checked_mul(1_000_000_000_000)
            .ok_or(DawnError::Overflow)?;
        
        let p_hat_scaled = average_n_est_scaled
            .checked_mul(1_000_000_000_000)
            .and_then(|x| x.checked_div(n_packets_scaled))
            .ok_or(DawnError::Overflow)?;

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
}

