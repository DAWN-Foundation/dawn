use anchor_lang::prelude::*;

use crate::{
    events::ProverRegistered,
    state::Prover,
    DawnApp,
};

#[derive(Accounts)]
pub struct RegisterProver<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The prover account
    #[account(
        init,
        payer = authority,
        space = Prover::SIZE,
        seeds = [
            Prover::SEED_PREFIX.as_ref(),
            authority.key().as_ref(),
        ],
        bump
    )]
    pub prover: Box<Account<'info, Prover>>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn register_prover(ctx: Context<RegisterProver>) -> Result<()> {
        let prover = &mut ctx.accounts.prover;
        let authority = ctx.accounts.authority.key();
        let current_slot = Clock::get()?.slot;

        // Initialize prover
        prover.authority = authority;
        prover.created_at_slot = current_slot;
        prover.stake_lamports = 0; // No stake required initially
        prover.reputation = 1000; // Initial reputation
        prover.bump = ctx.bumps.prover;

        emit!(ProverRegistered {
            prover: prover.key(),
            authority,
            stake_lamports: prover.stake_lamports,
            created_at_slot: current_slot,
        });

        Ok(())
    }
}
