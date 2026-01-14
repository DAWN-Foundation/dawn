// Vault accounts are now standard SPL Token accounts owned by PDAs.
// - Prover Vault: Token account at PDA [b"prover_vault", prover_pda] owned by the same PDA
// - Challenger Vault: Token account at PDA [b"challenger_vault", challenger_pda] owned by the same PDA
//
// These constants are kept for PDA seed derivation.

/// Seed prefix for prover vault token accounts
pub const PROVER_VAULT_SEED: &[u8] = b"prover_vault";

/// Seed prefix for challenger vault token accounts
pub const CHALLENGER_VAULT_SEED: &[u8] = b"challenger_vault";
