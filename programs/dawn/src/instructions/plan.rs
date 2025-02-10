use anchor_lang::prelude::*;

use super::{DawnApp, Device, Subscription};
use crate::{utils::optional_seed, DawnError, PlanAdded};

/// The plan account, representing a subscription plan tied to a device
#[account]
pub struct Plan {
    /// The creation timestamp
    pub created_at: i64,
    /// The plan owner
    pub owner: Pubkey,
    /// Associated device
    pub device: Pubkey,
    /// Whether the plan is a resale plan
    pub is_resale: bool,
    /// The parent plan (for resale)
    pub parent_plan: Pubkey,
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
    /// PDA bump seed
    pub bump: u8,
}

const PLAN_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // owner
    + 32 // device
    + 1 // is_resale
    + 32 // parent plan
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
            &device.mac_address,
        ],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,

    /// The parent plan account (if exists)
    #[account(
        seeds = [
            b"plan",
            parent_plan.device.as_ref(),
            &optional_seed(parent_plan.is_resale.then_some(parent_plan.parent_plan)),
            &parent_plan.price.to_le_bytes(),
            &parent_plan.duration.to_le_bytes(),
            &parent_plan.speed.to_le_bytes(),
            &parent_plan.capacity.to_le_bytes(),
            &parent_plan.sla_id.to_le_bytes(),
        ],
        bump = parent_plan.bump,
    )]
    pub parent_plan: Option<Account<'info, Plan>>,

    /// The plan account
    #[account(
        init,
        payer = caller,
        space = PLAN_SIZE,
        seeds = [
            b"plan",
            device.key().as_ref(),
            &optional_seed(parent_plan.as_ref().map(|p| p.key())),
            &price.to_le_bytes(),
            &duration.to_le_bytes(),
            &speed.to_le_bytes(),
            &capacity.to_le_bytes(),
            &sla_id.to_le_bytes(),
        ],
        bump
    )]
    pub plan: Account<'info, Plan>,

    /// The subscription account of parent plan (if exists)
    #[account(
        seeds = [
            b"subscription",
            subscription.plan.as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump,
    )]
    pub subscription: Option<Account<'info, Subscription>>,

    pub system_program: Program<'info, System>,
}

// #[derive(Accounts)]
// pub struct RemovePlan<'info> {
//     #[account(mut)]
//     pub caller: Signer<'info>,

//     #[account(
//         mut,
//         constraint = device.owner == caller.key(),
//         seeds = [
//             b"device",
//             device.owner.as_ref(),
//             device.model.as_ref(),
//             &device.mac_address
//         ],
//         bump = device.bump
//     )]
//     pub device: Account<'info, Device>,

//     /// The plan account
//     #[account(
//         mut,
//         constraint = plan.owner == caller.key(),
//         close = caller,
//         seeds = [
//             b"plan",
//             device.key().as_ref(),
//             &plan.price.to_le_bytes(),
//             &plan.duration.to_le_bytes(),
//             &plan.speed.to_le_bytes(),
//             &plan.capacity.to_le_bytes(),
//             &plan.sla_id.to_le_bytes(),
//             optional_seed(plan.parent_plan.as_ref().map(|p| p.key())).as_ref(),
//         ],
//         bump = plan.bump
//     )]
//     pub plan: Account<'info, Plan>,
// }

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

        let (is_resale, parent_plan) = if let Some(parent_plan) = ctx.accounts.parent_plan.as_ref()
        {
            require!(
                ctx.accounts.subscription.is_some(),
                DawnError::ParentPlanNeedSubscription
            );

            // make sure the resold plan is within parent plan
            require!(
                duration <= parent_plan.duration,
                DawnError::OutsideParentBounds,
            );
            require!(speed <= parent_plan.speed, DawnError::OutsideParentBounds);
            require!(
                capacity <= parent_plan.capacity,
                DawnError::OutsideParentBounds
            );

            (true, parent_plan.key())
        } else {
            (false, Pubkey::new_from_array([0; 32]))
        };

        let plan = &mut ctx.accounts.plan;

        plan.created_at = Clock::get()?.unix_timestamp;
        plan.owner = ctx.accounts.caller.key();
        plan.device = ctx.accounts.device.key();
        plan.is_resale = is_resale;
        plan.parent_plan = parent_plan;
        plan.price = price;
        plan.duration = duration;
        plan.speed = speed;
        plan.capacity = capacity; // 0 for unlimited
        plan.sla_id = sla_id;
        plan.bump = ctx.bumps.plan;

        emit!(PlanAdded {
            plan: plan.key(),
            owner: plan.owner,
            is_resale: plan.is_resale,
            parent_plan: plan.parent_plan,
            device: plan.device,
            price: plan.price,
            duration: plan.duration,
            speed: plan.speed,
            capacity: plan.capacity,
            sla_id: plan.sla_id,
            created_at: plan.created_at,
        });

        Ok(())
    }

    // pub fn remove_plan(ctx: Context<RemovePlan>) -> Result<()> {
    //     // TODO >> Make sure plan doesnt have any active subscriptions

    //     emit!(PlanRemoved {
    //         plan: ctx.accounts.plan.key(),
    //         device: ctx.accounts.device.key(),
    //     });

    //     Ok(())
    // }
}
