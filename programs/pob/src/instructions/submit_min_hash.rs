use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use data_anchor_blober as da;

use crate::error::PobError;
use crate::events::MinHashSubmitted;
use crate::state::{Aggregator, Prover, Receipt, RoundCommitment};
use crate::utils::{MerkleProof, SessionLeaf};

#[derive(Accounts)]
#[instruction(leaf: SessionLeaf, _proof: MerkleProof, min_token: [u8; 32], da_timestamp: u64)]
pub struct SubmitMinHash<'info> {
    #[account(mut)]
    pub prover_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            Prover::SEED_PREFIX.as_ref(),
            prover.authority.as_ref(),
        ],
        bump = prover.bump,
        constraint = prover.unstake_requested_slot == 0 @ PobError::ProverUnstaking,
    )]
    pub prover: Account<'info, Prover>,

    /// Round commitment with the Data-Anchor root
    pub round: Account<'info, RoundCommitment>,

    /// Aggregator for this round
    #[account(
        init_if_needed,
        payer = prover_authority,
        space = Aggregator::SIZE,
        seeds = [
            Aggregator::SEED_PREFIX.as_ref(),
            round.key().as_ref(),
            prover.key().as_ref(),
        ],
        bump
    )]
    pub aggregator: Box<Account<'info, Aggregator>>,

    /// Receipt for replay protection
    #[account(
        init,
        payer = prover_authority,
        space = Receipt::SIZE,
        seeds = [
            Receipt::SEED_PREFIX.as_ref(),
            round.key().as_ref(),
            prover.key().as_ref(),
            &min_token,
        ],
        bump
    )]
    pub receipt: Box<Account<'info, Receipt>>,

    /// CHECK: Blober (namespace) account — must already exist; owned by DA program
    #[account(mut, owner = data_anchor_blober::ID)]
    pub da_blober: UncheckedAccount<'info>,

    /// CHECK: Blob PDA for (da_blober, da_payer, da_timestamp, blob_size); created by declare_blob
    #[account(mut)]
    pub da_blob: UncheckedAccount<'info>,

    /// Payer for DA writes; MUST equal blober.caller (enforced by DA program)
    #[account(mut)]
    pub da_payer: Signer<'info>,

    /// Data Anchor program
    pub da_program: Program<'info, da::program::Blober>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SubmitMinHash>,
    leaf: SessionLeaf,
    proof: MerkleProof,
    min_token: [u8; 32],
    da_timestamp: u64,
) -> Result<()> {
    let round = &ctx.accounts.round;

    let leaf_hash = leaf.hash();
    let computed_root = proof.compute_root(leaf_hash);
    require!(
        computed_root == round.data_anchor_root,
        PobError::InvalidDAInclusion
    );

    require_keys_eq!(
        leaf.prover,
        ctx.accounts.prover.key(),
        PobError::WrongProver
    );

    // Validate round timing window
    let current_slot = Clock::get()?.slot;
    require!(
        current_slot >= round.start_slot,
        PobError::SubmissionTooEarly
    );
    require!(current_slot <= round.end_slot, PobError::SubmissionTooLate);

    // payload = v1 || round_id(le) || prover_authority || min_token
    let mut payload = Vec::with_capacity(1 + 32 + 32 + 32);
    payload.push(1u8); // version
    payload.extend_from_slice(&round.key().to_bytes());
    payload.extend_from_slice(ctx.accounts.prover.authority.as_ref());
    payload.extend_from_slice(&min_token);

    let blob_size: u32 = payload.len() as u32;

    // Data Anchor CPI calls
    da::cpi::declare_blob(
        CpiContext::new(
            ctx.accounts.da_program.to_account_info(),
            da::cpi::accounts::DeclareBlob {
                blob: ctx.accounts.da_blob.to_account_info(),
                blober: ctx.accounts.da_blober.to_account_info(),
                payer: ctx.accounts.da_payer.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
        ),
        da_timestamp,
        blob_size,
    )?;

    da::cpi::insert_chunk(
        CpiContext::new(
            ctx.accounts.da_program.to_account_info(),
            da::cpi::accounts::InsertChunk {
                blob: ctx.accounts.da_blob.to_account_info(),
                blober: ctx.accounts.da_blober.to_account_info(),
                payer: ctx.accounts.da_payer.to_account_info(),
            },
        ),
        0u16,
        payload,
    )?;

    da::cpi::finalize_blob(CpiContext::new(
        ctx.accounts.da_program.to_account_info(),
        da::cpi::accounts::FinalizeBlob {
            blob: ctx.accounts.da_blob.to_account_info(),
            blober: ctx.accounts.da_blober.to_account_info(),
            payer: ctx.accounts.da_payer.to_account_info(),
        },
    ))?;

    // Compute score
    let score = {
        let h = hashv(&[&round.seed, &min_token]);
        let bytes = h.to_bytes();
        u128::from_be_bytes(bytes[16..32].try_into().unwrap())
    };

    // Estimator: n_est = (1 - m) / m
    // Map score to m_scaled in (0, SCALE]
    // m = score / u128::MAX maps to [0, 1)
    // m_scaled = m * SCALE
    const SCALE: u128 = 1_000_000_000_000;
    const DIVISOR: u128 = u128::MAX / SCALE;

    // Add 1 to avoid division by zero when score is 0
    let m_scaled = score
        .checked_div(DIVISOR)
        .unwrap_or(0)
        .saturating_add(1)
        .min(SCALE);

    // n_est = (1 - m) / m
    // n_est_scaled = (SCALE - m_scaled) * SCALE / m_scaled
    let n_est_scaled = SCALE
        .saturating_sub(m_scaled)
        .saturating_mul(SCALE)
        .saturating_div(m_scaled);

    // Update aggregator
    let aggregator = &mut ctx.accounts.aggregator;

    if aggregator.version == 0 {
        aggregator.round = round.key();
        aggregator.prover = ctx.accounts.prover.key();
        aggregator.num_submissions = 0;
        aggregator.sum_n_est_scaled = 0;
        aggregator.finalized = false;
        aggregator.finalized_p_hat_scaled = 0;
        aggregator.version = 1;
        aggregator.bump = ctx.bumps.aggregator;
    }

    aggregator.num_submissions = aggregator.num_submissions.saturating_add(1);
    aggregator.sum_n_est_scaled = aggregator.sum_n_est_scaled.saturating_add(n_est_scaled);

    // Initialize receipt for replay protection
    let receipt = &mut ctx.accounts.receipt;
    receipt.round = round.key();
    receipt.prover = ctx.accounts.prover.key();
    receipt.min_token = min_token;
    receipt.submitted_at_slot = Clock::get()?.slot;
    receipt.bump = ctx.bumps.receipt;

    emit!(MinHashSubmitted {
        round: round.key(),
        prover: ctx.accounts.prover.key(),
        challenger: leaf.challenger,
        m_scaled,
        n_est_scaled,
        submitted_at_slot: receipt.submitted_at_slot,
    });

    Ok(())
}
