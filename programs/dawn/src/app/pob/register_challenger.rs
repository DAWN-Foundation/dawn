use anchor_lang::prelude::*;

use crate::{
    events::ChallengerRegistered,
    state::Challenger,
    DawnApp,
};

#[derive(Accounts)]
pub struct RegisterChallenger<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The challenger account
    #[account(
        init,
        payer = authority,
        space = Challenger::SIZE,
        seeds = [
            Challenger::SEED_PREFIX.as_ref(),
            authority.key().as_ref(),
        ],
        bump
    )]
    pub challenger: Box<Account<'info, Challenger>>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn register_challenger(ctx: Context<RegisterChallenger>) -> Result<()> {
        let challenger = &mut ctx.accounts.challenger;
        let authority = ctx.accounts.authority.key();
        let current_slot = Clock::get()?.slot;

        // Initialize challenger
        challenger.authority = authority;
        challenger.created_at_slot = current_slot;
        challenger.stake_lamports = 0; // No stake required initially
        challenger.reputation = 1000; // Initial reputation
        challenger.bump = ctx.bumps.challenger;

        emit!(ChallengerRegistered {
            challenger: challenger.key(),
            authority,
            stake_lamports: challenger.stake_lamports,
            created_at_slot: current_slot,
        });

        Ok(())
    }
}
