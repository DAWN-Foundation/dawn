use crate::{
    app::{amf::AuthMethodType, Config, DawnApp},
    utils::optional_pubkey_seed,
};
use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};

/// Account structure for authentication methods
#[account]
pub struct AuthMethod {
    /// The authority of the auth method
    pub authority: Pubkey,
    /// Which method this represents (maps to AuthMethodType enum)
    pub method_type: AuthMethodType,
    /// Method-specific parameters (fixed size buffer)
    pub parameters: [u8; 256],
    /// PDA bump
    pub bump: u8,
}

pub const AUTH_METHOD_SIZE: usize = 8 // id
    + 32 // authority
    + 1 // method_type
    + 256 // parameters
    + 1; // bump

/// Context for registering a new authentication method
#[derive(Accounts)]
#[instruction(method_type: AuthMethodType, parameters: [u8; 256])]
pub struct RegisterAuthMethod<'info> {
    #[account(mut)]
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
            caller.key().as_ref(),
            method_type.as_seed(),
            &parameters[..MAX_SEED_LEN],
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
        parameters: [u8; 256],
    ) -> Result<()> {
        let auth_method = &mut ctx.accounts.auth_method;

        auth_method.authority = ctx.accounts.caller.key();
        auth_method.method_type = method_type;
        auth_method.parameters = parameters;
        auth_method.bump = ctx.bumps.auth_method;

        Ok(())
    }
}
