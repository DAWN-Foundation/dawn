use anchor_lang::prelude::*;

use crate::{app::DawnApp, error::DawnError};

use super::AuthMethod;

/// Account structure for client credentials
#[account]
pub struct ClientCredential {
    /// The client public key
    pub client_pubkey: Pubkey,
    /// The method this credential is for
    pub method_type: u8,
    /// The authority who created this credential
    pub authority: Pubkey,
    /// Whether this credential is revoked
    pub is_revoked: bool,
    /// Whether this is a one-way or two-way credential (0 = one-way, 1 = two-way)
    pub credential_type: u8,
    /// Credential-specific data (fixed size buffer)
    pub credential_data: [u8; 128],
    /// PDA bump
    pub bump: u8,
}

pub const CLIENT_CREDENTIAL_SIZE: usize = 8 // client_pubkey
    + 1 // method_type
    + 1 // authority
    + 1 // is_revoked
    + 1 // credential_type
    + 128 // credential_data
    + 1; // bump

/// Context for registering client credentials
#[derive(Accounts)]
#[instruction(method_type: u8, credential_data: [u8; 128])]
pub struct RegisterClientCredential<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: TODO
    pub client: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [
            b"auth_method",
            &[method_type],
            authority.key().as_ref()
        ],
        bump = auth_method.bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<ClientCredential>(),
        seeds = [
            b"credential",
            client.key().as_ref(),
            &[method_type]
        ],
        bump
    )]
    pub credential: Account<'info, ClientCredential>,

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
            &[credential.method_type]
        ],
        bump = credential.bump,
        constraint = credential.authority == authority.key()
    )]
    pub credential: Account<'info, ClientCredential>,
}

impl DawnApp {
    /// Register client credentials for an auth method
    pub fn register_client_credential(
        ctx: Context<RegisterClientCredential>,
        method_type: u8,
        credential_data: [u8; 128],
    ) -> Result<()> {
        // Ensure auth method is active
        require!(
            ctx.accounts.auth_method.is_active,
            DawnError::InactiveAuthMethod
        );

        let credential = &mut ctx.accounts.credential;

        credential.client_pubkey = ctx.accounts.client.key();
        credential.method_type = method_type;
        credential.authority = ctx.accounts.authority.key();
        credential.is_revoked = false;
        credential.credential_type = 0; // One-way credential
        credential.credential_data = credential_data;
        credential.bump = ctx.bumps.credential;

        Ok(())
    }

    /// Revoke client credentials
    pub fn revoke_credential(ctx: Context<RevokeCredential>) -> Result<()> {
        ctx.accounts.credential.is_revoked = true;
        Ok(())
    }
}
