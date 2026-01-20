use anchor_lang::prelude::*;

#[error_code]
pub enum PobError {
    #[msg("Arithmetic operation overflowed")]
    Overflow,

    #[msg("Prover already registered")]
    ProverAlreadyRegistered,

    #[msg("Challenger already registered")]
    ChallengerAlreadyRegistered,

    #[msg("Invalid round parameters")]
    InvalidRoundParameters,

    #[msg("Round not found")]
    RoundNotFound,

    #[msg("Round already exists")]
    RoundAlreadyExists,

    #[msg("Round not active")]
    RoundNotActive,

    #[msg("Round expired")]
    RoundExpired,

    #[msg("Round grace period has not elapsed")]
    RoundGracePeriodNotElapsed,

    #[msg("Aggregator not found")]
    AggregatorNotFound,

    #[msg("Aggregator already finalized")]
    AggregatorAlreadyFinalized,

    #[msg("Aggregator not finalized")]
    AggregatorNotFinalized,

    #[msg("Invalid merkle proof")]
    InvalidMerkleProof,

    #[msg("Invalid data anchor proof")]
    InvalidDataAnchorProof,

    #[msg("Invalid token")]
    InvalidToken,

    #[msg("Invalid score")]
    InvalidScore,

    #[msg("Submission too late")]
    SubmissionTooLate,

    #[msg("Submission too early")]
    SubmissionTooEarly,

    #[msg("Invalid stake amount")]
    InvalidStakeAmount,

    #[msg("Insufficient stake")]
    InsufficientStake,

    #[msg("Invalid reputation")]
    InvalidReputation,

    #[msg("Invalid version")]
    InvalidVersion,

    #[msg("Replay attack detected")]
    ReplayAttack,

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

    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    #[msg("Unstake not requested")]
    UnstakeNotRequested,

    #[msg("Cooldown period not elapsed")]
    CooldownNotElapsed,

    #[msg("Unstake already requested")]
    UnstakeAlreadyRequested,

    #[msg("Prover is unstaking and cannot participate")]
    ProverUnstaking,

    #[msg("Challenger is unstaking and cannot participate")]
    ChallengerUnstaking,
}
