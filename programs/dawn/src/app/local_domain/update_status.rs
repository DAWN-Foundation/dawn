use anchor_lang::prelude::*;

use crate::{state::LocalDomain, DawnApp, DawnError};

/// Account context for `update_local_domain_status`.
///
/// Only the LocalDomain's `owner` (the SP that registered the domain
/// via add_device) may mutate its coverage status — enforced by the
/// `address = local_domain.owner` constraint on the signer.
#[derive(Accounts)]
pub struct UpdateLocalDomainStatus<'info> {
    #[account(mut, address = local_domain.owner @ DawnError::Unauthorized)]
    pub caller: Signer<'info>,

    /// The domain to mutate. Verified by its stored bump.
    #[account(mut)]
    pub local_domain: Account<'info, LocalDomain>,
}

impl DawnApp {
    /// Mutate a LocalDomain's coverage status. The new status must be
    /// 0..=3 (Active / Degraded / Maintenance / Offline).
    ///
    /// Updates `coverage_status` and stamps `last_status_change_at` with
    /// the current Solana clock. Off-chain BSS systems can use this
    /// timestamp as the canonical "billing pause begins" marker; OSS
    /// systems use it as a "device provisioning hold" trigger.
    pub fn update_local_domain_status(
        ctx: Context<UpdateLocalDomainStatus>,
        new_status: u8,
    ) -> Result<()> {
        require!(new_status <= 3, DawnError::InvalidStatus);
        let local_domain = &mut ctx.accounts.local_domain;
        local_domain.coverage_status = new_status;
        local_domain.last_status_change_at = Clock::get()?.unix_timestamp;
        Ok(())
    }
}
