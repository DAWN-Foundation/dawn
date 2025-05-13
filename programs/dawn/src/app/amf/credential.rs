use anchor_lang::prelude::*;
use solana_program::pubkey::MAX_SEED_LEN;

use crate::{app::DawnApp, error::DawnError};

use super::{AuthMethod, AuthMethodType};

/// Account structure for client credentials
#[account]
pub struct Credential {
    /// The creation timestamp
    pub created_at: i64,
    /// The client public key
    pub client_pubkey: Pubkey,
    /// The method this credential is for
    pub method_type: AuthMethodType,
    /// The authority who created this credential
    pub authority: Pubkey,
    /// Credential-specific data (fixed size buffer)
    pub credential_data: [u8; 128],
    /// PDA bump
    pub bump: u8,
}

pub const CREDENTIAL_SIZE: usize = 8 // id
    + 8 // created_at
    + 32 // client_pubkey
    + 1 // method_type
    + 1 // authority
    + 128 // credential_data
    + 1; // bump

/// Context for registering client credentials
#[derive(Accounts)]
#[instruction(method_type: u8, credential_data: [u8; 128])]
pub struct RegisterCredential<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: TODO
    pub client: AccountInfo<'info>,

    #[account(
        mut,
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
        payer = authority,
        space = CREDENTIAL_SIZE,
        seeds = [
            b"credential",
            client.key().as_ref(),
            &[method_type]
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
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"credential",
            credential.client_pubkey.as_ref(),
            credential.method_type.as_seed()
        ],
        bump = credential.bump,
        constraint = credential.authority == authority.key(),
        close = authority
    )]
    pub credential: Account<'info, Credential>,
}

impl DawnApp {
    /// Register client credentials for an auth method
    pub fn register_credential(
        ctx: Context<RegisterCredential>,
        method_type: AuthMethodType,
        credential_data: [u8; 128],
    ) -> Result<()> {
        let credential = &mut ctx.accounts.credential;

        credential.client_pubkey = ctx.accounts.client.key();
        credential.method_type = method_type;
        credential.authority = ctx.accounts.authority.key();
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
