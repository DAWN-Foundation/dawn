use anchor_lang::prelude::*;

#[event]
pub struct ProverRegistered {
    pub prover: Pubkey,
    pub authority: Pubkey,
    pub stake_amount: u64,
    pub created_at_slot: u64,
}

#[event]
pub struct ChallengerRegistered {
    pub challenger: Pubkey,
    pub authority: Pubkey,
    pub stake_amount: u64,
    pub created_at_slot: u64,
}

#[event]
pub struct ChallengeRoundCreated {
    pub round: Pubkey,
    pub seed: [u8; 32],
    pub n_packets: u32,
    pub n_rounds: u16,
    pub start_slot: u64,
    pub end_slot: u64,
    pub expected_min_scaled: u128,
    pub data_anchor_root: [u8; 32],
    pub created_at_slot: u64,
}

#[event]
pub struct SessionCommitmentEmitted {
    pub challenger: Pubkey,
    pub prover: Pubkey,
    pub round: Pubkey,
    pub da_pointer: [u8; 32],
    pub emitted_at_slot: u64,
}

#[event]
pub struct MinHashSubmitted {
    pub round: Pubkey,
    pub prover: Pubkey,
    pub challenger: Pubkey,
    pub m_scaled: u128,
    pub n_est_scaled: u128,
    pub submitted_at_slot: u64,
}

#[event]
pub struct AggregatorFinalized {
    pub aggregator: Pubkey,
    pub round: Pubkey,
    pub prover: Pubkey,
    pub p_hat_scaled: u128,
    pub num_submissions: u32,
    pub da_snapshot_pointer: [u8; 32],
    pub finalized_at_slot: u64,
}
