use anchor_lang::prelude::*;

use crate::error::PobError;
use crate::state::{Config, RoundCommitment};

#[derive(Accounts)]
pub struct CloseRound<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,

    /// The config account
    #[account(
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

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

pub fn handler(ctx: Context<CloseRound>) -> Result<()> {
    let current_slot = Clock::get()?.slot;
    let round_commitment = &ctx.accounts.round_commitment;
    let config = &ctx.accounts.config;

    // Check if round has ended and grace period has elapsed
    require!(
        current_slot > round_commitment.end_slot,
        PobError::RoundNotActive
    );
    
    require!(
        current_slot > round_commitment.end_slot.saturating_add(config.round_close_grace_slots),
        PobError::RoundGracePeriodNotElapsed
    );

    Ok(())
}
