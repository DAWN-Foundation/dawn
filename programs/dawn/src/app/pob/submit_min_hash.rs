use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use data_anchor_blober as da; // alias for the CPI crate

use crate::state::{Aggregator, Prover, RoundCommitment};
use crate::utils::{MerkleProof, SessionLeaf};
use crate::DawnApp;
use crate::DawnError;

impl DawnApp {
    pub fn submit_min_hash(
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
            DawnError::InvalidDAInclusion
        );

        require_keys_eq!(
            leaf.prover,
            ctx.accounts.prover.key(),
            DawnError::WrongProver
        );

        // payload = v1 || round_id(le) || prover_authority || min_token
        // keep it tiny (fits 1 chunk)
        let mut payload = Vec::with_capacity(1 + 32 + 32 + 32);
        payload.push(1u8); // version
        payload.extend_from_slice(&round.key().to_bytes());
        payload.extend_from_slice(ctx.accounts.prover.authority.as_ref());
        payload.extend_from_slice(&min_token);

        // Declare blob in your namespace (da_blober), with fixed timestamp+size used for PDA derivation
        let blob_size: u32 = payload.len() as u32;

        // da_payer must equal blober.caller (Data Anchor enforces this)
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

        // Insert the single chunk (idx=0) with our payload
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

        // Finalize the blob (rolls its digest into blober.hash; closes da_blob)
        da::cpi::finalize_blob(CpiContext::new(
            ctx.accounts.da_program.to_account_info(),
            da::cpi::accounts::FinalizeBlob {
                blob: ctx.accounts.da_blob.to_account_info(),
                blober: ctx.accounts.da_blober.to_account_info(),
                payer: ctx.accounts.da_payer.to_account_info(),
            },
        ))?;

        // ---------------- 4) Compute score (your code, unchanged) ----------------
        let score = {
            let h = hashv(&[&round.start_slot.to_le_bytes(), &min_token]);
            let bytes = h.to_bytes();
            u128::from_be_bytes(bytes[16..32].try_into().unwrap())
        };

        // ---------------- 5) Estimator (your code, unchanged) ----------------
        let scale = 1_000_000_000_000u128;
        let n_u = leaf.n as u128;
        let n_est_scaled = {
            let s = score % scale;
            let mapped = s.saturating_mul(2);
            n_u.saturating_mul(mapped).saturating_div(scale.max(1))
        };

        // ---------------- 6) Update aggregator (your code, mostly unchanged) ----------------
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

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(leaf: SessionLeaf, _proof: MerkleProof, min_token: [u8; 32], da_timestamp: u64)]
pub struct SubmitMinHash<'info> {
    // ===== Your signer & state =====
    #[account(mut)]
    pub prover_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            Prover::SEED_PREFIX.as_ref(),
            prover.authority.as_ref(),
        ],
        bump = prover.bump
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

    // ===== Data Anchor (Blober) CPI =====
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
