use anchor_lang::prelude::*;

use crate::{events::ServiceAgreementAdded, Config, DawnApp, DawnError};

/// The plan account, representing a subscription plan tied to a device
#[account]
pub struct ServiceAgreement {
    /// The creation timestamp
    pub created_at: i64,
    /// The percentage threshold for the service agreement
    pub threshold: u64,
    /// The payout ratio for the service agreement
    pub payout_ratio: u64,
    /// PDA bump seed
    pub bump: u8,
}

const SERVICE_AGREEMENT_SIZE: usize = 8 // id
    + 8 // created_at
    + 8 // threshold
    + 8 // payout_ratio
    + 1; // bump

#[derive(Accounts)]
#[instruction(threshold: u64, payout_ratio: u64)]
pub struct AddServiceAgreement<'info> {
    #[account(mut, constraint = caller.key() == config.authority)]
    pub caller: Signer<'info>,

    /// The config with fees and ratios applied to the plan payments
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// The service agreement account
    #[account(
        init,
        payer = caller,
        space = SERVICE_AGREEMENT_SIZE,
        seeds = [
            b"service_agreement",
            &threshold.to_le_bytes()[..],
            &payout_ratio.to_le_bytes()[..],
        ],
        bump
    )]
    pub service_agreement: Account<'info, ServiceAgreement>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn add_service_agreement(
        ctx: Context<AddServiceAgreement>,
        threshold: u64,
        payout_ratio: u64,
    ) -> Result<()> {
        // make sure payout ratio is not 0
        require!(payout_ratio > 0, DawnError::ZeroPayoutRatio);

        let service_agreement = &mut ctx.accounts.service_agreement;

        service_agreement.created_at = Clock::get()?.unix_timestamp;
        service_agreement.threshold = threshold;
        service_agreement.payout_ratio = payout_ratio;
        service_agreement.bump = ctx.bumps.service_agreement;

        emit!(ServiceAgreementAdded {
            service_agreement: service_agreement.key(),
            threshold,
            payout_ratio,
            created_at: service_agreement.created_at,
        });

        Ok(())
    }
}
