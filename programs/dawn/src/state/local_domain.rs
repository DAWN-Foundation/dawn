use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// The local domain account.
///
/// Acts as the BSS↔OSS bridge: every Plan (BSS) and every Device (OSS)
/// references a LocalDomain. Mutations to LocalDomain state are the
/// canonical "domain change" trigger that off-chain BSS and OSS systems
/// subscribe to.
#[account]
#[derive(InitSpace)]
pub struct LocalDomain {
    /// The creation timestamp
    pub created_at: i64,
    // Name of the local domain converted to a fixed-size byte array
    #[max_len(32)]
    pub name: String,
    /// The owner of the local domain
    pub owner: Pubkey,
    /// Operational status of the domain's coverage. Encoded as u8 to keep
    /// the layout simple and Borsh-friendly:
    ///   0 = Active        — normal operation
    ///   1 = Degraded      — partial outage
    ///   2 = Maintenance   — planned maintenance window
    ///   3 = Offline       — not serving
    pub coverage_status: u8,
    /// Unix timestamp of the last `coverage_status` change. On creation
    /// this matches `created_at`.
    pub last_status_change_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl LocalDomain {
    pub const SEED_PREFIX: &'static [u8] = b"local_domain";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
