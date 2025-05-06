use crate::app::{amf::AuthMethodType, Config, DawnApp};
use anchor_lang::prelude::*;

/// Account structure for authentication methods
#[account]
pub struct AuthMethod {
    /// Which method this represents (maps to AuthMethodType enum)
    pub method_type: AuthMethodType,
    /// Whether this method is currently active
    pub is_active: bool,
    /// Method-specific parameters (fixed size buffer)
    pub parameters: [u8; 128],
    /// PDA bump
    pub bump: u8,
}

pub const AUTH_METHOD_SIZE: usize = 8 // id
    + 1 // method_type
    + 1 // is_active
    + 128 // parameters
    + 1; // bump

/// Context for registering a new authentication method
#[derive(Accounts)]
#[instruction(method_type: AuthMethodType, parameters: [u8; 128])]
pub struct RegisterAuthMethod<'info> {
    #[account(mut, constraint = caller.key() == config.authority)]
    pub caller: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = caller,
        space = AUTH_METHOD_SIZE,
        seeds = [
            b"auth_method",
            method_type.as_seed(),
        ],
        bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Register a new authentication method
    pub fn register_auth_method(
        ctx: Context<RegisterAuthMethod>,
        method_type: AuthMethodType,
        parameters: [u8; 128],
    ) -> Result<()> {
        let auth_method = &mut ctx.accounts.auth_method;

        auth_method.method_type = method_type;
        auth_method.is_active = true;
        auth_method.parameters = parameters;
        auth_method.bump = ctx.bumps.auth_method;

        Ok(())
    }
}
