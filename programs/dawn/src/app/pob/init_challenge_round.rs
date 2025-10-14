use anchor_lang::prelude::*;

use crate::{
    events::ChallengeRoundCreated,
    state::RoundCommitment,
    DawnApp, DawnError,
};

#[derive(Accounts)]
#[instruction(
    seed: [u8; 32],
    n_packets: u32,
    n_rounds: u16,
    start_slot: u64,
    end_slot: u64,
    data_anchor_root: [u8; 32],
)]
pub struct InitChallengeRound<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The round commitment account
    #[account(
        init,
        payer = caller,
        space = RoundCommitment::SIZE,
        seeds = [
            RoundCommitment::SEED_PREFIX.as_ref(),
            &seed,
        ],
        bump
    )]
    pub round: Box<Account<'info, RoundCommitment>>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn init_challenge_round(
        ctx: Context<InitChallengeRound>,
        seed: [u8; 32],
        n_packets: u32,
        n_rounds: u16,
        start_slot: u64,
        end_slot: u64,
        data_anchor_root: [u8; 32],
    ) -> Result<()> {
        // Validate parameters
        require!(n_packets > 0, DawnError::InvalidRoundParameters);
        require!(n_rounds > 0, DawnError::InvalidRoundParameters);
        require!(start_slot < end_slot, DawnError::InvalidRoundParameters);
        
        let current_slot = Clock::get()?.slot;
        // require!(start_slot > current_slot, DawnError::InvalidRoundParameters);

        // Use the provided seed

        // Calculate expected minimum = 1/(N+1) scaled by 1e12
        let expected_min_scaled = (1_000_000_000_000u128)
            .checked_div(n_packets as u128 + 1)
            .ok_or(DawnError::Overflow)?;

        let round = &mut ctx.accounts.round;
        
        // Initialize round commitment
        round.seed = seed;
        round.expected_min_scaled = expected_min_scaled;
        round.n_packets = n_packets;
        round.n_rounds = n_rounds;
        round.start_slot = start_slot;
        round.end_slot = end_slot;
        round.data_anchor_root = data_anchor_root;
        round.bump = ctx.bumps.round;

        emit!(ChallengeRoundCreated {
            round: round.key(),
            seed,
            n_packets,
            n_rounds,
            start_slot,
            end_slot,
            expected_min_scaled,
            data_anchor_root,
            created_at_slot: current_slot,
        });

        Ok(())
    }
}
