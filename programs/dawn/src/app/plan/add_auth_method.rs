use anchor_lang::prelude::*;

use crate::{
    events::AuthMethodAdded,
    state::{AuthMethod, Device},
    utils::{hash_parameters, hash_string_seed, optional_pubkey_seed},
    DawnApp, DawnError, Plan,
};

/// Context for adding an auth method to a plan
#[derive(Accounts)]
pub struct AddAuthMethod<'info> {
    #[account(mut, constraint = caller.key() == plan.owner)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [
            Plan::SEED_PREFIX.as_ref(),
            plan.local_domain.as_ref(),
            &optional_pubkey_seed(plan.parent_plan),
            &hash_string_seed(&plan.name),
            &plan.price.to_le_bytes(),
            &plan.duration.to_le_bytes(),
            &plan.speed.to_le_bytes(),
            &plan.capacity.to_le_bytes(),
            &plan.start_at.to_le_bytes(),
            plan.service_agreement.as_ref(),
        ],
        bump = plan.bump,
    )]
    pub plan: Account<'info, Plan>,

    #[account(
        address = auth_method.device,
        constraint = device.local_domain == plan.local_domain @ DawnError::DeviceNotInLocalDomain,
        seeds = [
            Device::SEED_PREFIX.as_ref(),
            device.owner.as_ref(),
            device.model.as_ref(),
            &hash_string_seed(&device.name),
            &device.mac_address,
        ],
        bump = device.bump,
    )]
    pub device: Account<'info, Device>,

    #[account(
        seeds = [
            AuthMethod::SEED_PREFIX.as_ref(),
            auth_method.authority.as_ref(),
            &auth_method.method_type.as_seed(),
            auth_method.device.as_ref(),
            &hash_parameters(&auth_method.parameters),
        ],
        bump = auth_method.bump
    )]
    pub auth_method: Account<'info, AuthMethod>,
}

impl DawnApp {
    /// Add an auth method to a plan
    pub fn add_auth_method(ctx: Context<AddAuthMethod>) -> Result<()> {
        let plan = &mut ctx.accounts.plan;
        let auth_method = &ctx.accounts.auth_method;

        // Check if the auth method is already associated with this plan
        require!(
            !plan.auth_methods.contains(&auth_method.key()),
            DawnError::DuplicateAuthMethods
        );

        // Check if we haven't exceeded the maximum number of auth methods (3)
        require!(plan.auth_methods.len() < 3, DawnError::TooManyAuthMethods);

        // Add the auth method to the plan
        plan.auth_methods.push(auth_method.key());

        emit!(AuthMethodAdded {
            auth_method: auth_method.key(),
            plan: plan.key(),
            created_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Validate auth methods from remaining accounts
    pub fn validate_auth_methods(
        remaining_accounts: &[AccountInfo],
        caller: &Pubkey,
    ) -> Result<Vec<Pubkey>> {
        // Check that we don't have more than 3 auth methods
        require!(remaining_accounts.len() <= 3, DawnError::TooManyAuthMethods);

        let mut auth_method_keys = Vec::new();

        for account_info in remaining_accounts.iter() {
            let auth_method_key = account_info.key();

            // Check for duplicate auth methods
            require!(
                !auth_method_keys.contains(&auth_method_key),
                DawnError::DuplicateAuthMethods
            );

            // Get account data
            let data = &account_info.data.borrow();

            require!(!data.is_empty(), DawnError::InvalidAuthMethodAccount);

            require!(data.len() >= 8, DawnError::InvalidAuthMethodAccount);
            let discriminator = &data[0..8];
            require!(
                discriminator == AuthMethod::DISCRIMINATOR,
                DawnError::InvalidAuthMethodAccount
            );

            // Validate account is owned by our program
            require!(
                account_info.owner == &crate::ID,
                DawnError::InvalidAuthMethodAccount
            );

            // Deserialize the auth method account using try_from_slice
            let auth_method = AuthMethod::try_from_slice(&data[8..])
                .map_err(|_| DawnError::InvalidAuthMethodAccount)?;

            // Verify the authority matches the caller
            require!(
                auth_method.authority == *caller,
                DawnError::InvalidAuthMethodAuthority
            );
            auth_method_keys.push(auth_method_key);
        }

        Ok(auth_method_keys)
    }
}
