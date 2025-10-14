use anchor_lang::prelude::*;
use solana_program::hash::hashv;

mod state;
mod da_proof;

use state::{RoundCommitment, Aggregator, Receipt};
use da_proof::{SessionLeaf, MerkleProof};

declare_id!("YourProgram1111111111111111111111111111111111");

#[program]
pub mod dawn {
    use super::*;

    // ----------------------- INIT ROUND -----------------------
    pub fn init_round_commitment(
        ctx: Context<InitRoundCommitment>,
        round_id: u64,
        seed: [u8; 32],
        expected_min_scaled: u128,
        n_packets: u32,
        n_rounds: u16,
        start_slot: u64,
        end_slot: u64,
        data_anchor_root: [u8; 32],
    ) -> Result<()> {
        let round = &mut ctx.accounts.round;
        round.authority = ctx.accounts.authority.key();
        round.round_id = round_id;
        round.seed = seed;
        round.expected_min_scaled = expected_min_scaled;
        round.n_packets = n_packets;
        round.n_rounds = n_rounds;
        round.start_slot = start_slot;
        round.end_slot = end_slot;
        round.data_anchor_root = data_anchor_root;
        round.bump = *ctx.bumps.get("round").unwrap();
        Ok(())
    }

    // ---------------------- INIT AGGREGATOR -------------------
    pub fn init_aggregator(
        ctx: Context<InitAggregator>,
        scale: u64,           // pass 1_000_000_000 from tests (or default in client)
        version: u32,
    ) -> Result<()> {
        let aggr = &mut ctx.accounts.aggregator;
        aggr.round = ctx.accounts.round.key();
        aggr.num_submissions = 0;
        aggr.sum_n_est_scaled = 0;
        aggr.scale = scale;
        aggr.finalized = false;
        aggr.version = version;
        aggr.bump = *ctx.bumps.get("aggregator").unwrap();
        Ok(())
    }

    // ----------------------- SUBMIT MIN HASH ------------------
    pub fn submit_min_hash(
        ctx: Context<SubmitMinHash>,
        leaf: SessionLeaf,
        proof: MerkleProof,
        min_token: [u8; 32],
    ) -> Result<()> {
        let round = &ctx.accounts.round;

        // 1. Verify DA inclusion
        let leaf_hash = leaf.hash();
        let computed_root = proof.compute_root(leaf_hash);
        require!(computed_root == round.data_anchor_root, DawnError::InvalidDAInclusion);

        // 2. Bind to signer + round
        require_keys_eq!(leaf.prover, ctx.accounts.prover.key(), DawnError::WrongProver);
        require!(leaf.round_id == round.round_id, DawnError::WrongRoundId);

        // 3. Replay-guard via receipt PDA
        let receipt = &mut ctx.accounts.receipt;
        require!(!receipt.used, DawnError::Replay);
        receipt.round = round.key();
        receipt.prover = ctx.accounts.prover.key();
        receipt.min_token = min_token;
        receipt.used = true;

        // 4. Score = H(seed || min_token)
        let score = {
            let h = hashv(&[&round.seed, &min_token]);
            let bytes: [u8; 32] = h.into();
            u128::from_be_bytes(bytes[16..32].try_into().unwrap())
        };

        // 5. Estimator (example). You can replace with your own model.
        let aggr = &mut ctx.accounts.aggregator;
        require_keys_eq!(aggr.round, round.key(), DawnError::AggregatorRoundMismatch);
        let scale = aggr.scale as u128;
        let n_u = leaf.n as u128;
        let mapped = (score % scale).saturating_mul(2);
        let n_est_scaled = n_u.saturating_mul(mapped).saturating_div(scale.max(1));

        // 6. Update aggregator
        aggr.num_submissions = aggr.num_submissions.saturating_add(1);
        aggr.sum_n_est_scaled = aggr.sum_n_est_scaled.saturating_add(n_est_scaled);

        Ok(())
    }
}

// ------------------------------ ACCOUNTS ------------------------------------

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct InitRoundCommitment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The authority who configures the round
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + std::mem::size_of::<RoundCommitment>(),
        seeds = [b"round", b"commitment", &round_id.to_le_bytes()],
        bump
    )]
    pub round: Account<'info, RoundCommitment>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitAggregator<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub authority: Signer<'info>,

    #[account()]
    pub round: Account<'info, RoundCommitment>,

    #[account(
        init,
        payer = payer,
        space = 8 + std::mem::size_of::<Aggregator>(),
        seeds = [b"aggregator", round.key().as_ref()],
        bump
    )]
    pub aggregator: Account<'info, Aggregator>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(leaf: SessionLeaf, _proof: MerkleProof, min_token: [u8; 32])]
pub struct SubmitMinHash<'info> {
    /// Prover submitting min token
    #[account(mut)]
    pub prover: Signer<'info>,

    /// Round this submission belongs to
    #[account()]
    pub round: Account<'info, RoundCommitment>,

    /// Aggregator for that round
    #[account(mut, has_one = round)]
    pub aggregator: Account<'info, Aggregator>,

    /// Replay-guard PDA: seeds = ["receipt", round, prover, min_token]
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + std::mem::size_of::<Receipt>(),
        seeds = [b"receipt", round.key().as_ref(), prover.key().as_ref(), &min_token],
        bump
    )]
    pub receipt: Account<'info, Receipt>,

    /// Payer for the (potential) receipt creation
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ------------------------------ ERRORS --------------------------------------

#[error_code]
pub enum DawnError {
    #[msg("Invalid Data Anchor inclusion proof")]
    InvalidDAInclusion,
    #[msg("Prover does not match the leaf")]
    WrongProver,
    #[msg("Leaf round_id does not match the on-chain round")]
    WrongRoundId,
    #[msg("Replay: this (round, prover, min_token) was already submitted")]
    Replay,
    #[msg("Aggregator bound to a different round")]
    AggregatorRoundMismatch,
}