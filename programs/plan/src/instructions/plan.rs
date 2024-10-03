use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use super::{Building, PlanApp};
use crate::{PlanAdded, PlanError};

#[account]
pub struct Plan {
    /// The plan owner
    pub owner: Pubkey,
    /// Associated building
    pub building: Pubkey,
    /// The plan price
    pub price: u64,
    /// Plan PDA bump seed
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(price: u64)]
pub struct AddPlan<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The building account (must be owned by the caller)
    #[account(
        mut,
        constraint = building.owner == caller.key(),
        seeds = [
            b"building",
            &building.name.as_bytes()[..min(building.name.len(), MAX_SEED_LEN)],
            &building.address.as_bytes()[..min(building.address.len(), MAX_SEED_LEN)],
            &[building.floors],
        ],
        bump = building.bump
    )]
    pub building: Account<'info, Building>,

    /// The plan account
    #[account(
        init,
        payer = caller,
        space = 8 + 32 + 32 + 8 + 1, // 32 for owner, 32 for building, 8 for price, 1 for bump
        seeds = [
            b"plan",
            building.address.as_bytes(),
            &price.to_le_bytes(),
        ],
        bump
    )]
    pub plan: Account<'info, Plan>,

    pub system_program: Program<'info, System>,
}

impl PlanApp {
    pub fn add_plan(ctx: Context<AddPlan>, price: u64) -> Result<()> {
        let plan = &mut ctx.accounts.plan;

        // Make sure the plan price is not zero
        if price == 0 {
            return err!(PlanError::ZeroPlanPrice);
        }

        plan.owner = ctx.accounts.caller.key();
        plan.building = ctx.accounts.building.key();
        plan.price = price;
        plan.bump = ctx.bumps.plan;

        emit!(PlanAdded {
            owner: plan.owner,
            building: plan.building,
            price: plan.price,
        });

        Ok(())
    }
}
