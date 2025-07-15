use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};

use crate::app::DawnApp;

use super::AuthMethod;

/// Account structure for connection between two entities
#[account]
pub struct Connection {
    /// The creation timestamp
    pub created_at: i64,
    /// The auth method this connection uses
    pub auth_method: Pubkey,
    /// Entity A public key (typically initiator)
    pub entity_a: Pubkey,
    /// Entity B public key (typically responder)
    pub entity_b: Pubkey,
    /// Entity A credential data (fixed size buffer)
    pub credential_data_a: [u8; 64],
    /// Entity B credential data (fixed size buffer)
    pub credential_data_b: [u8; 64],
    /// PDA bump
    pub bump: u8,
}

pub const CONNECTION_SIZE: usize = 8 // discriminator
    + 8 // created_at
    + 32 // auth_method
    + 32 // entity_a
    + 32 // entity_b
    + 64 // credential_data_a
    + 64 // credential_data_b
    + 1; // bump

/// Context for registering connection credentials
#[derive(Accounts)]
#[instruction(
    entity_a: Pubkey,
    entity_b: Pubkey,
    credential_data_a: [u8; 64],
    credential_data_b: [u8; 64]
)]
pub struct RegisterConnection<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        constraint = auth_method.authority == caller.key(),
        seeds = [
            b"auth_method",
            auth_method.authority.as_ref(),
            &auth_method.method_type.as_seed(),
            auth_method.plan.as_ref(),
            &auth_method.parameters[..MAX_SEED_LEN]
        ],
        bump = auth_method.bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        init,
        payer = caller,
        space = CONNECTION_SIZE,
        seeds = [
            b"connection",
            auth_method.key().as_ref(),
            entity_a.as_ref(),
            entity_b.as_ref(),
        ],
        bump
    )]
    pub connection: Account<'info, Connection>,

    pub system_program: Program<'info, System>,
}

/// Context for revoking connection credentials
#[derive(Accounts)]
pub struct RevokeConnection<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    // auth method
    #[account(
        mut,
        constraint = auth_method.authority == caller.key(),
        seeds = [
            b"auth_method",
            auth_method.authority.as_ref(),
            &auth_method.method_type.as_seed(),
            auth_method.plan.as_ref(),
            &auth_method.parameters[..MAX_SEED_LEN]
        ],
        bump = auth_method.bump,
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        mut,
        constraint = connection.auth_method == auth_method.key(),
        seeds = [
            b"connection",
            connection.auth_method.as_ref(),
            connection.entity_a.as_ref(),
            connection.entity_b.as_ref(),
        ],
        bump = connection.bump,
        close = caller
    )]
    pub connection: Account<'info, Connection>,
}

impl DawnApp {
    /// Register connection credentials for two-way auth methods
    pub fn register_connection(
        ctx: Context<RegisterConnection>,
        entity_a: Pubkey,
        entity_b: Pubkey,
        credential_data_a: [u8; 64],
        credential_data_b: [u8; 64],
    ) -> Result<()> {
        let connection = &mut ctx.accounts.connection;

        connection.created_at = Clock::get()?.unix_timestamp;
        connection.entity_a = entity_a;
        connection.entity_b = entity_b;
        connection.auth_method = ctx.accounts.auth_method.key();
        connection.credential_data_a = credential_data_a;
        connection.credential_data_b = credential_data_b;
        connection.bump = ctx.bumps.connection;

        Ok(())
    }

    /// Revoke connection credentials by closing the account
    pub fn revoke_connection(_ctx: Context<RevokeConnection>) -> Result<()> {
        // Account will be automatically closed due to the `close = authority` constraint
        Ok(())
    }
}
