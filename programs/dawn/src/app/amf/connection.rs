use anchor_lang::prelude::*;

use crate::{app::DawnApp, error::DawnError};

use super::AuthMethod;

/// Account structure for connection credentials
#[account]
pub struct ConnectionCredential {
    /// Entity A public key (typically initiator)
    pub entity_a_pubkey: Pubkey,
    /// Entity B public key (typically responder)
    pub entity_b_pubkey: Pubkey,
    /// The method this connection credential is for
    pub method_type: u8,
    /// The authority who created this credential
    pub authority: Pubkey,
    /// Whether this credential is revoked
    pub is_revoked: bool,
    /// Entity A credential data (fixed size buffer)
    pub entity_a_credential_data: [u8; 64],
    /// Entity B credential data (fixed size buffer)
    pub entity_b_credential_data: [u8; 64],
    /// PDA bump
    pub bump: u8,
}

pub const CONNECTION_CREDENTIAL_SIZE: usize = 8 // entity_a_pubkey
    + 8 // entity_b_pubkey
    + 1 // method_type
    + 1 // authority
    + 1 // is_revoked
    + 64 // entity_a_credential_data
    + 64 // entity_b_credential_data 
    + 1; // bump

/// Context for registering connection credentials
#[derive(Accounts)]
#[instruction(method_type: u8, entity_a_credential_data: [u8; 64], entity_b_credential_data: [u8; 64])]
pub struct RegisterConnectionCredential<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: TODO
    pub entity_a: AccountInfo<'info>,
    /// CHECK: TODO
    pub entity_b: AccountInfo<'info>,

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
        space = CONNECTION_CREDENTIAL_SIZE,
        seeds = [
            b"connection",
            entity_a.key().as_ref(),
            entity_b.key().as_ref(),
            &[method_type]
        ],
        bump
    )]
    pub connection: Account<'info, ConnectionCredential>,

    pub system_program: Program<'info, System>,
}

/// Context for revoking connection credentials
#[derive(Accounts)]
pub struct RevokeConnection<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"connection",
            connection.entity_a_pubkey.as_ref(),
            connection.entity_b_pubkey.as_ref(),
            &[connection.method_type]
        ],
        bump = connection.bump,
        constraint = connection.authority == authority.key()
    )]
    pub connection: Account<'info, ConnectionCredential>,
}

impl DawnApp {
    /// Register connection credentials for two-way auth methods
    pub fn register_connection(
        ctx: Context<RegisterConnectionCredential>,
        method_type: u8,
        entity_a_credential_data: [u8; 64],
        entity_b_credential_data: [u8; 64],
    ) -> Result<()> {
        // Ensure auth method is active
        require!(
            ctx.accounts.auth_method.is_active,
            DawnError::InactiveAuthMethod
        );

        let connection = &mut ctx.accounts.connection;

        connection.entity_a_pubkey = ctx.accounts.entity_a.key();
        connection.entity_b_pubkey = ctx.accounts.entity_b.key();
        connection.method_type = method_type;
        connection.authority = ctx.accounts.authority.key();
        connection.is_revoked = false;
        connection.entity_a_credential_data = entity_a_credential_data;
        connection.entity_b_credential_data = entity_b_credential_data;
        connection.bump = ctx.bumps.connection;

        Ok(())
    }

    /// Revoke connection credentials
    pub fn revoke_connection(ctx: Context<RevokeConnection>) -> Result<()> {
        ctx.accounts.connection.is_revoked = true;
        Ok(())
    }
}
