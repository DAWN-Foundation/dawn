use anchor_lang::{
    prelude::*,
    solana_program::pubkey::{MAX_SEEDS, MAX_SEED_LEN},
};
use std::cmp::min;

use super::{Building, PlanApp};
use crate::{PlanAdded, PlanError};

/// The plan account, representing a subscription plan tied to a building
#[account]
pub struct Plan {
    /// The plan owner
    pub owner: Pubkey,
    /// Associated building
    pub building: Pubkey,
    /// The plan price
    pub price: u64,
    /// The plan duration in days
    pub duration: u16,
    /// The plan provided speed in Mbps (megabits per second)
    pub speed: u32,
    /// The plan provided data capacity in MB (megabytes)
    /// per `duration` days, 0 for unlimited
    pub capacity: u64,
    /// The Service Level Agreement identifier
    pub sla_id: u64,
    /// Plan PDA bump seed
    pub bump: u8,
}

/// 8 (id) + 32 (owner) + 32 (building) + 8 (price) + 2 (duration) + 4 (speed) + 8 (capacity) + 8 (sla_id) + 1 (bump)
const PLAN_SIZE: usize = 8 + 32 + 32 + 8 + 2 + 4 + 8 + 8 + 1;

#[derive(Accounts)]
#[instruction(price: u64, duration: u16, speed: u32, capacity: u64, sla_id: u64)]
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
        space = PLAN_SIZE,
        seeds = [
            b"plan",
            building.address.as_bytes(),
            &price.to_le_bytes(),
            &duration.to_le_bytes(),
            &speed.to_le_bytes(),
            &capacity.to_le_bytes(),
            &sla_id.to_le_bytes(),
        ],
        bump
    )]
    pub plan: Account<'info, Plan>,

    pub system_program: Program<'info, System>,
}

impl PlanApp {
    pub fn add_plan(
        ctx: Context<AddPlan>,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        sla_id: u64,
    ) -> Result<()> {
        let plan = &mut ctx.accounts.plan;

        // Make sure the plan price is not zero
        if price == 0 {
            return err!(PlanError::ZeroPlanPrice);
        }

        // Make sure the plan duration is not zero
        if duration == 0 {
            return err!(PlanError::ZeroPlanDuration);
        }

        // Make sure the plan speed is not zero
        if speed == 0 {
            return err!(PlanError::ZeroPlanSpeed);
        }

        plan.owner = ctx.accounts.caller.key();
        plan.building = ctx.accounts.building.key();
        plan.price = price;
        plan.duration = duration;
        plan.speed = speed;
        plan.capacity = capacity;
        plan.sla_id = sla_id;
        plan.bump = ctx.bumps.plan;

        emit!(PlanAdded {
            owner: plan.owner,
            building: plan.building,
            price: plan.price,
        });

        Ok(())
    }
}
