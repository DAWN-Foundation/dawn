use anchor_lang::prelude::*;

use crate::{
    state::RoundCommitment,
    DawnApp, DawnError,
};

#[derive(Accounts)]
pub struct CloseRound<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,

    /// The round commitment account
    #[account(
        mut,
        close = beneficiary,
        seeds = [
            RoundCommitment::SEED_PREFIX.as_ref(),
            &round_commitment.seed,
        ],
        bump = round_commitment.bump
    )]
    pub round_commitment: Box<Account<'info, RoundCommitment>>,
}

impl DawnApp {
    pub fn close_round(ctx: Context<CloseRound>) -> Result<()> {
        let current_slot = Clock::get()?.slot;
        let round_commitment = &ctx.accounts.round_commitment;

        // Check if round has ended
        require!(
            current_slot > round_commitment.end_slot,
            DawnError::RoundNotActive
        );

        // Note: In a full implementation, you would check that all aggregators
        // for this round have been finalized before allowing the round to be closed.
        // This is a simplified version.

        Ok(())
    }
}

