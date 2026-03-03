use anchor_lang::prelude::*;

use crate::{
    error::DawnError,
    events::CredentialRegistered,
    state::{AuthMethod, Credential, Plan, Subscription},
};

pub fn process_register_credential(
    plan: &Account<Plan>,
    subscription: &Account<Subscription>,
    auth_method: &Account<AuthMethod>,
    authority: Pubkey,
    credential: &mut Account<Credential>,
    credential_data: [u8; 128],
    credential_bump: u8,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;

    // Validate subscription is not expired
    require!(
        subscription.expiration > current_time,
        DawnError::SubscriptionExpired
    );

    // Validate auth method is assigned to the plan
    require!(
        plan.auth_methods.contains(&auth_method.key()),
        DawnError::AuthMethodNotInPlan
    );

    credential.created_at = current_time;
    credential.authority = authority;
    credential.plan = plan.key();
    credential.subscription = subscription.key();
    credential.auth_method = auth_method.key();
    credential.credential_data = credential_data;
    credential.bump = credential_bump;

    emit!(CredentialRegistered {
        credential: credential.key(),
        authority: credential.authority,
        plan: credential.plan,
        subscription: credential.subscription,
        auth_method: credential.auth_method,
        credential_data: credential.credential_data,
        created_at: credential.created_at,
    });

    Ok(())
}
