use anchor_lang::prelude::*;

use crate::error::PobError;
use crate::events::SessionCommitmentEmitted;
use crate::state::{Challenger, Prover, RoundCommitment};

#[derive(Accounts)]
#[instruction(da_pointer: [u8; 32])]
pub struct EmitSessionCommitment<'info> {
    #[account(mut)]
    pub challenger_authority: Signer<'info>,

    /// The round commitment account
    #[account(
        seeds = [
            RoundCommitment::SEED_PREFIX.as_ref(),
            &round_commitment.seed,
        ],
        bump = round_commitment.bump
    )]
    pub round_commitment: Box<Account<'info, RoundCommitment>>,

    /// The challenger account
    #[account(
        seeds = [
            Challenger::SEED_PREFIX.as_ref(),
            challenger.authority.as_ref(),
        ],
        bump = challenger.bump,
        constraint = challenger.authority == challenger_authority.key() @ PobError::Unauthorized,
        constraint = challenger.unstake_requested_slot == 0 @ PobError::ChallengerUnstaking,
    )]
    pub challenger: Box<Account<'info, Challenger>>,

    /// The prover account
    #[account(
        seeds = [
            Prover::SEED_PREFIX.as_ref(),
            prover.authority.as_ref(),
        ],
        bump = prover.bump,
        constraint = prover.unstake_requested_slot == 0 @ PobError::ProverUnstaking,
    )]
    pub prover: Box<Account<'info, Prover>>,
}

pub fn handler(ctx: Context<EmitSessionCommitment>, da_pointer: [u8; 32]) -> Result<()> {
    let current_slot = Clock::get()?.slot;
    let round_commitment = &ctx.accounts.round_commitment;

    // Check if round is active
    require!(
        current_slot >= round_commitment.start_slot && current_slot <= round_commitment.end_slot,
        PobError::RoundNotActive
    );

    emit!(SessionCommitmentEmitted {
        challenger: ctx.accounts.challenger.key(),
        prover: ctx.accounts.prover.key(),
        round: round_commitment.key(),
        da_pointer,
        emitted_at_slot: current_slot,
    });

    Ok(())
}
