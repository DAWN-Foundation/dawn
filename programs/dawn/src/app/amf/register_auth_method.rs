use crate::{
    app::DawnApp,
    state::{AuthMethod, AuthMethodType, Config, Device},
    utils::optional_pubkey_seed,
};
use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};

/// Context for registering a new authentication method
#[derive(Accounts)]
#[instruction(method_type: AuthMethodType, parameters: [u8; 256])]
pub struct RegisterAuthMethod<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = caller,
        space = AuthMethod::SIZE,
        seeds = [
            AuthMethod::SEED_PREFIX.as_ref(),
            caller.key().as_ref(),
            method_type.as_seed(),
            &parameters[..MAX_SEED_LEN],
        ],
        bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        constraint = device.owner == caller.key(),
        seeds = [
            Device::SEED_PREFIX.as_ref(),
            caller.key().as_ref(),
            device.model.as_ref(),
            &device.name.as_ref(),
            &device.mac_address,
        ],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Register a new authentication method
    pub fn register_auth_method(
        ctx: Context<RegisterAuthMethod>,
        method_type: AuthMethodType,
        parameters: [u8; 256],
    ) -> Result<()> {
        let auth_method = &mut ctx.accounts.auth_method;

        auth_method.authority = ctx.accounts.caller.key();
        auth_method.method_type = method_type;
        auth_method.device = ctx.accounts.device.key();
        auth_method.parameters = parameters;
        auth_method.bump = ctx.bumps.auth_method;

        Ok(())
    }
}
