use anchor_lang::prelude::*;

use super::{Config, DawnApp, Plan, Subscription};
use crate::{events::SubscriptionExtended, utils::optional_pubkey_seed};

#[derive(Accounts)]
pub struct ExtendSubscription<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and accounts
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// The plan account
    #[account(
        seeds = [
            b"plan",
            plan.access_domain.as_ref(),
            plan.device.as_ref(),
            &optional_pubkey_seed(plan.is_resale.then_some(plan.parent_plan)),
            &plan.name.as_bytes(),
            &plan.price.to_le_bytes(),
            &plan.duration.to_le_bytes(),
            &plan.speed.to_le_bytes(),
            &plan.capacity.to_le_bytes(),
            &plan.start_at.to_le_bytes(),
            plan.service_agreement.as_ref(),
        ],
        bump = plan.bump
    )]
    pub plan: Box<Account<'info, Plan>>,

    /// The subscription account
    #[account(
        mut,
        seeds = [
            b"subscription",
            plan.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump
    )]
    pub subscription: Box<Account<'info, Subscription>>,
}

impl DawnApp {
    pub fn extend_subscription(ctx: Context<ExtendSubscription>) -> Result<()> {
        let plan = &ctx.accounts.plan;
        let subscription = &mut ctx.accounts.subscription;

        // Calculate subscription expiration by adding plan `duration` days to current subscription expiration
        let expiration = subscription.expiration + (plan.duration as i64);

        // Save subscription data
        subscription.expiration = expiration;

        emit!(SubscriptionExtended {
            subscription: subscription.key(),
            plan: plan.key(),
            subscriber: ctx.accounts.caller.key(),
            device: subscription.device,
            expiration: subscription.expiration,
            created_at: subscription.created_at,
        });

        Ok(())
    }
}
