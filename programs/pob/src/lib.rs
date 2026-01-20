#![allow(clippy::too_many_arguments)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

declare_id!("PoBrUKPnS6aHnXpAgtQYnLK7mQzFGF5ktk6CrXA9b8N");

mod constants;
mod error;
mod events;
mod instructions;
mod state;
mod utils;

use instructions::*;
use utils::*;

#[program]
pub mod pob {
    use super::*;

    pub fn register_prover(ctx: Context<RegisterProver>) -> Result<()> {
        register_prover::handler(ctx)
    }

    pub fn register_challenger(ctx: Context<RegisterChallenger>) -> Result<()> {
        register_challenger::handler(ctx)
    }

    pub fn init_config(
        ctx: Context<InitConfig>,
        round_close_grace_slots: u64,
        prover_stake_amount: u64,
        challenger_stake_amount: u64,
        unstake_cooldown_slots: u64,
    ) -> Result<()> {
        init_config::handler(
            ctx,
            round_close_grace_slots,
            prover_stake_amount,
            challenger_stake_amount,
            unstake_cooldown_slots,
        )
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        round_close_grace_slots: u64,
        prover_stake_amount: u64,
        challenger_stake_amount: u64,
        unstake_cooldown_slots: u64,
    ) -> Result<()> {
        update_config::handler(
            ctx,
            round_close_grace_slots,
            prover_stake_amount,
            challenger_stake_amount,
            unstake_cooldown_slots,
        )
    }

    pub fn init_challenge_round(
        ctx: Context<InitChallengeRound>,
        seed: [u8; 32],
        n_packets: u32,
        n_rounds: u16,
        start_slot: u64,
        end_slot: u64,
        data_anchor_root: [u8; 32],
    ) -> Result<()> {
        init_challenge_round::handler(
            ctx,
            seed,
            n_packets,
            n_rounds,
            start_slot,
            end_slot,
            data_anchor_root,
        )
    }

    pub fn emit_session_commitment(
        ctx: Context<EmitSessionCommitment>,
        da_pointer: [u8; 32],
    ) -> Result<()> {
        emit_session_commitment::handler(ctx, da_pointer)
    }

    pub fn submit_min_hash(
        ctx: Context<SubmitMinHash>,
        leaf: SessionLeaf,
        proof: MerkleProof,
        min_token: [u8; 32],
        da_timestamp: u64,
    ) -> Result<()> {
        submit_min_hash::handler(ctx, leaf, proof, min_token, da_timestamp)
    }

    pub fn finalize_aggregator(
        ctx: Context<FinalizeAggregator>,
        da_snapshot_pointer: [u8; 32],
    ) -> Result<()> {
        finalize_aggregator::handler(ctx, da_snapshot_pointer)
    }

    pub fn close_round(ctx: Context<CloseRound>) -> Result<()> {
        close_round::handler(ctx)
    }

    pub fn close_aggregator(ctx: Context<CloseAggregator>) -> Result<()> {
        close_aggregator::handler(ctx)
    }

    pub fn close_receipt(ctx: Context<CloseReceipt>) -> Result<()> {
        close_receipt::handler(ctx)
    }

    pub fn request_unstake_prover(ctx: Context<RequestUnstakeProver>) -> Result<()> {
        request_unstake_prover::handler(ctx)
    }

    pub fn complete_unstake_prover(ctx: Context<CompleteUnstakeProver>) -> Result<()> {
        complete_unstake_prover::handler(ctx)
    }

    pub fn request_unstake_challenger(ctx: Context<RequestUnstakeChallenger>) -> Result<()> {
        request_unstake_challenger::handler(ctx)
    }

    pub fn complete_unstake_challenger(ctx: Context<CompleteUnstakeChallenger>) -> Result<()> {
        complete_unstake_challenger::handler(ctx)
    }
}
