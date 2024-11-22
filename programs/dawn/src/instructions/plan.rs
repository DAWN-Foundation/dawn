use anchor_lang::prelude::*;

use super::{DawnApp, Device};
use crate::{DawnError, PlanAdded, PlanRemoved};

/// The plan account, representing a subscription plan tied to a device
#[account]
pub struct Plan {
    /// The plan owner
    pub owner: Pubkey,
    /// Associated device
    pub device: Pubkey,
    /// The plan price per `duration` days (in USDC with 6 decimals)
    pub price: u64,
    /// The plan duration in days
    pub duration: u16,
    /// The plan provided speed in Mbps (megabits per second)
    pub speed: u32,
    /// The plan provided data capacity in MB (megabytes)
    /// per `duration` days, 0 for unlimited
    pub capacity: u64,
    /// TODO >> The Service Level Agreement identifier
    pub sla_id: u64,
    /// Plan PDA bump seed
    pub bump: u8,
}

const PLAN_SIZE: usize = 8 // id
    + 32 // owner
    + 32 // device
    + 8 // price
    + 2 // duration
    + 4 // speed
    + 8 // capacity
    + 8 // sla_id
    + 1; // bump

#[derive(Accounts)]
#[instruction(price: u64, duration: u16, speed: u32, capacity: u64, sla_id: u64)]
pub struct AddPlan<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The device account (must be owned by the caller)
    #[account(
        mut,
        constraint = device.owner == caller.key(),
        seeds = [
            b"device",
            device.owner.as_ref(),
            device.model.as_ref(),
        ],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,

    /// The plan account
    #[account(
        init,
        payer = caller,
        space = PLAN_SIZE,
        seeds = [
            b"plan",
            device.key().as_ref(),
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

#[derive(Accounts)]
pub struct RemovePlan<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = device.owner == caller.key(),
        seeds = [
            b"device",
            device.owner.as_ref(),
            device.model.as_ref(),
        ],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,

    /// The plan account
    #[account(
        mut,
        constraint = plan.owner == caller.key(),
        close = caller,
        seeds = [
            b"plan",
            device.key().as_ref(),
            &plan.price.to_le_bytes(),
            &plan.duration.to_le_bytes(),
            &plan.speed.to_le_bytes(),
            &plan.capacity.to_le_bytes(),
            &plan.sla_id.to_le_bytes(),
        ],
        bump = plan.bump
    )]
    pub plan: Account<'info, Plan>,
}

impl DawnApp {
    pub fn add_plan(
        ctx: Context<AddPlan>,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        sla_id: u64,
    ) -> Result<()> {
        // Make sure the plan price is not zero
        require!(price > 0, DawnError::ZeroPlanPrice);

        // Make sure the plan duration is not zero
        require!(duration > 0, DawnError::ZeroPlanDuration);

        // Make sure the plan speed is not zero
        require!(speed > 0, DawnError::ZeroPlanSpeed);

        let plan = &mut ctx.accounts.plan;

        plan.owner = ctx.accounts.caller.key();
        plan.device = ctx.accounts.device.key();
        plan.price = price;
        plan.duration = duration;
        plan.speed = speed;
        plan.capacity = capacity; // 0 for unlimited
        plan.sla_id = sla_id;
        plan.bump = ctx.bumps.plan;

        emit!(PlanAdded {
            plan: plan.key(),
            owner: plan.owner,
            device: plan.device,
            price: plan.price,
            duration: plan.duration,
            speed: plan.speed,
            capacity: plan.capacity,
            sla_id: plan.sla_id,
        });

        Ok(())
    }

    pub fn remove_plan(ctx: Context<RemovePlan>) -> Result<()> {
        // TODO >> Make sure plan doesnt have any active subscriptions

        emit!(PlanRemoved {
            plan: ctx.accounts.plan.key(),
            device: ctx.accounts.device.key(),
        });

        Ok(())
    }
}
