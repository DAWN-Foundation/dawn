use anchor_lang::{prelude::*, solana_program::clock::SECONDS_PER_DAY};

use crate::{
    app::subscription::payment::{self, PaymentAccounts},
    error::DawnError,
    events::{Subscribed, SubscriptionExtended},
    state::{Config, Device, Plan, Subscription},
};

/// Validate plan has started if start_at is set
pub(super) fn validate_plan_started(plan_start_at: i64, current_time: i64) -> Result<()> {
    if plan_start_at > 0 {
        require!(plan_start_at <= current_time, DawnError::InvalidStartTime);
    }
    Ok(())
}

/// Calculate subscription expiration by adding plan duration to current time
pub(super) fn calculate_subscription_expiration(
    current_time: i64,
    plan_duration: u16,
) -> Result<i64> {
    // Calculate plan duration in seconds (days to seconds)
    let duration_in_seconds = (plan_duration as u64)
        .checked_mul(SECONDS_PER_DAY)
        .ok_or(DawnError::Overflow)?;

    // Calculate subscription expiration by adding plan duration to current timestamp
    let expiration = current_time
        .checked_add(duration_in_seconds as i64)
        .ok_or(DawnError::Overflow)?;

    Ok(expiration)
}

/// Calculate extended expiration for subscription extension
pub(super) fn calculate_extended_expiration(
    current_expiration: i64,
    current_time: i64,
    plan_duration: u16,
) -> Result<i64> {
    // Calculate plan duration in seconds (days to seconds)
    let duration_in_seconds = (plan_duration as u64)
        .checked_mul(SECONDS_PER_DAY)
        .ok_or(DawnError::Overflow)?;

    // If subscription is expired, set expiration starting from now
    let expiration = if current_expiration < current_time {
        current_time
            .checked_add(duration_in_seconds as i64)
            .ok_or(DawnError::Overflow)?
    } else {
        // Calculate subscription expiration by adding plan duration to existing expiration
        current_expiration
            .checked_add(duration_in_seconds as i64)
            .ok_or(DawnError::Overflow)?
    };

    Ok(expiration)
}

/// Common subscription creation logic
pub(super) fn process_subscription_creation(
    payment_accounts: PaymentAccounts,
    config: &Config,
    plan: &Plan,
    subscription: &mut Subscription,
    subscription_key: Pubkey,
    plan_key: Pubkey,
    subscriber: Pubkey,
    device: Option<&Account<Device>>,
    min_dawn_out: u64,
    deadline: i64,
    bump: u8,
) -> Result<()> {
    // Validate deadline
    let current_time = Clock::get()?.unix_timestamp;
    payment::validate_deadline(current_time, deadline)?;

    // Validate min_dawn_out is reasonable (not zero)
    require!(min_dawn_out > 0, DawnError::InvalidMinimumOutput);

    // Validate plan has started
    validate_plan_started(plan.start_at, current_time)?;

    // Process payment
    let (claimable_dawn, daily_usdc, actual_dawn_out) =
        payment::process_payment(payment_accounts, config, plan, min_dawn_out)?;

    // Calculate subscription expiration
    let expiration = calculate_subscription_expiration(current_time, plan.duration)?;

    // Initialize subscription data
    subscription.init(
        plan_key,
        subscriber,
        device.map(|d| d.key()),
        claimable_dawn,
        daily_usdc,
        bump,
        current_time,
        expiration,
    );

    // Emit event
    emit!(Subscribed {
        subscription: subscription_key,
        plan: plan_key,
        subscriber,
        device: subscription.device,
        expiration: subscription.expiration,
        last_claim: subscription.last_claim,
        claimable_dawn: subscription.claimable_dawn,
        daily_usdc: subscription.daily_usdc,
        swap_price: actual_dawn_out as u128,
        created_at: subscription.created_at,
    });

    Ok(())
}

/// Common subscription extension logic
pub(super) fn process_subscription_extension(
    payment_accounts: PaymentAccounts,
    config: &Config,
    plan: &Plan,
    subscription: &mut Subscription,
    subscription_key: Pubkey,
    plan_key: Pubkey,
    subscriber: Pubkey,
    min_dawn_out: u64,
    deadline: i64,
) -> Result<()> {
    // Validate deadline
    let current_time = Clock::get()?.unix_timestamp;
    payment::validate_deadline(current_time, deadline)?;

    // Validate min_dawn_out is reasonable (not zero)
    require!(min_dawn_out > 0, DawnError::InvalidMinimumOutput);

    // Calculate extended expiration (common to both paths)
    let expiration =
        calculate_extended_expiration(subscription.expiration, current_time, plan.duration)?;

    // Check if subscription is expired
    let is_expired = subscription.expiration < current_time;
    let actual_dawn_out = if is_expired {
        // Expired subscription: treat as new subscription
        let (additional_claimable, new_daily_usdc, actual_dawn_out) =
            payment::process_payment(payment_accounts, config, plan, min_dawn_out)?;

        // Update subscription amounts
        subscription.claimable_dawn = subscription
            .claimable_dawn
            .checked_add(additional_claimable)
            .ok_or(DawnError::Overflow)?;

        subscription.daily_usdc = new_daily_usdc;

        // Reset last_claim to prevent gap period theft
        subscription.last_claim = current_time;

        actual_dawn_out
    } else {
        // Active subscription: swap fees to DAWN immediately, add remaining USDC to escrow
        let (new_daily_usdc, actual_dawn_out) =
            payment::process_extension_payment(payment_accounts, config, plan, min_dawn_out)?;

        // Calculate weighted average for daily_usdc
        // remaining_days = time left on current subscription
        // new_days = plan duration from extension
        // weighted_daily_usdc = (current_daily * remaining_days + new_daily * new_days) / total_days
        let remaining_seconds = subscription
            .expiration
            .checked_sub(current_time)
            .ok_or(DawnError::Underflow)?;
        let remaining_days = (remaining_seconds as u64)
            .checked_div(SECONDS_PER_DAY)
            .ok_or(DawnError::Underflow)?;
        let new_days = plan.duration as u64;
        let total_days = remaining_days
            .checked_add(new_days)
            .ok_or(DawnError::Overflow)?;

        // Calculate weighted average (handle edge case where total_days could be 0)
        let weighted_daily_usdc = if total_days > 0 {
            let current_portion = (subscription.daily_usdc as u128)
                .checked_mul(remaining_days as u128)
                .ok_or(DawnError::Overflow)?;
            let new_portion = (new_daily_usdc as u128)
                .checked_mul(new_days as u128)
                .ok_or(DawnError::Overflow)?;
            let total = current_portion
                .checked_add(new_portion)
                .ok_or(DawnError::Overflow)?;
            total
                .checked_div(total_days as u128)
                .ok_or(DawnError::Underflow)? as u64
        } else {
            new_daily_usdc
        };

        subscription.daily_usdc = weighted_daily_usdc;

        actual_dawn_out
    };

    // Save subscription data
    subscription.expiration = expiration;

    // Emit event
    emit!(SubscriptionExtended {
        subscription: subscription_key,
        plan: plan_key,
        subscriber,
        device: subscription.device,
        expiration: subscription.expiration,
        swap_price: actual_dawn_out as u128,
        created_at: subscription.created_at,
    });

    Ok(())
}
