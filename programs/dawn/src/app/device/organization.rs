use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use crate::app::DawnApp;
/// The type of the organization
#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug, PartialEq, Eq)]
pub enum OrganizationType {
    NumberAuthority,
    Rir,
    Registry,
    EndUser,
}

impl OrganizationType {
    pub fn to_seed(&self) -> &[u8] {
        match self {
            Self::NumberAuthority => &[0],
            Self::Rir => &[1],
            Self::Registry => &[2],
            Self::EndUser => &[3],
        }
    }
}

/// The organization account, representing an organization
#[account]
pub struct Organization {
    /// The creation timestamp
    pub created_at: i64,
    /// The owner of the organization
    pub owner: Pubkey,
    /// The type of the organization
    pub organization_type: OrganizationType,
    /// The name of the organization
    pub name: String,
    /// PDA bump seed
    pub bump: u8,
}

pub const ORGANIZATION_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // owner
    + 1 // organization_type
    + 32 // name
    + 1; // bump

#[derive(Accounts)]
#[instruction(name: String, organization_type: OrganizationType)]
pub struct SetOrganizationName<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The organization account
    #[account(
        mut,
        constraint = organization.owner == caller.key(),
        seeds = [
            b"organization",
            organization.owner.as_ref(),
            organization.organization_type.to_seed(),
            &organization.name.as_bytes()[..min(organization.name.len(), MAX_SEED_LEN)],
        ],
        bump = organization.bump,
    )]
    pub organization: Account<'info, Organization>,
}

impl DawnApp {
    #[allow(dead_code)]
    pub fn set_organization_name(ctx: Context<SetOrganizationName>, name: String) -> Result<()> {
        let organization = &mut ctx.accounts.organization;
        organization.name = name;
        Ok(())
    }
}
