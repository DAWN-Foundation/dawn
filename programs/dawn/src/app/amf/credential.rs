use anchor_lang::prelude::*;
use solana_program::pubkey::MAX_SEED_LEN;

use crate::app::DawnApp;

use super::AuthMethod;

/// Account structure for client credentials
#[account]
pub struct Credential {
    /// The creation timestamp
    pub created_at: i64,
    /// The auth method this credential is for
    pub auth_method: Pubkey,
    /// The client public key
    pub client: Pubkey,
    /// Credential-specific data (fixed size buffer)
    pub credential_data: [u8; 128],
    /// PDA bump
    pub bump: u8,
}

pub const CREDENTIAL_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // auth_method
    + 32 // client
    + 128 // credential_data
    + 1; // bump

/// Context for registering client credentials
#[derive(Accounts)]
#[instruction(client: Pubkey, credential_data: [u8; 128])]
pub struct RegisterCredential<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = auth_method.authority == caller.key(),
        seeds = [
            b"auth_method",
            auth_method.authority.as_ref(),
            &auth_method.method_type.as_seed(),
            &auth_method.parameters[..MAX_SEED_LEN]
        ],
        bump = auth_method.bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        init,
        payer = caller,
        space = CREDENTIAL_SIZE,
        seeds = [
            b"credential",
            auth_method.key().as_ref(),
            client.key().as_ref(),
        ],
        bump
    )]
    pub credential: Account<'info, Credential>,

    pub system_program: Program<'info, System>,
}

/// Context for revoking client credentials
#[derive(Accounts)]
pub struct RevokeCredential<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = auth_method.authority == caller.key(),
        seeds = [
            b"auth_method",
            auth_method.authority.as_ref(),
            &auth_method.method_type.as_seed(),
            &auth_method.parameters[..MAX_SEED_LEN]
        ],
        bump = auth_method.bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        mut,
        seeds = [
            b"credential",
            auth_method.key().as_ref(),
            credential.client.as_ref(),
        ],
        bump = credential.bump,
        close = caller
    )]
    pub credential: Account<'info, Credential>,
}

impl DawnApp {
    /// Register client credentials for an auth method
    pub fn register_credential(
        ctx: Context<RegisterCredential>,
        client: Pubkey,
        credential_data: [u8; 128],
    ) -> Result<()> {
        let credential = &mut ctx.accounts.credential;

        credential.created_at = Clock::get()?.unix_timestamp;
        credential.client = client;
        credential.auth_method = ctx.accounts.auth_method.key();
        credential.credential_data = credential_data;
        credential.bump = ctx.bumps.credential;

        Ok(())
    }

    /// Revoke client credentials by closing the account
    pub fn revoke_credential(_ctx: Context<RevokeCredential>) -> Result<()> {
        // Account will be automatically closed due to the `close = authority` constraint
        Ok(())
    }
}
