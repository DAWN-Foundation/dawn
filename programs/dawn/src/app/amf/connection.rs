use anchor_lang::prelude::*;
use solana_program::pubkey::MAX_SEED_LEN;

use crate::app::DawnApp;

use super::AuthMethod;

/// Authentication connection types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum ConnectionType {
    /// IPSec Authentication Header
    IPSecAH = 0,
    /// Generic bidirectional connection
    Generic = 1,
}

impl ConnectionType {
    pub fn from_u8(value: u8) -> Result<Self> {
        match value {
            0 => Ok(ConnectionType::IPSecAH),
            1 => Ok(ConnectionType::Generic),
            _ => Err(error!(ErrorCode::InvalidConnectionType)),
        }
    }

    pub fn as_u8(&self) -> u8 {
        match self {
            ConnectionType::IPSecAH => 0,
            ConnectionType::Generic => 1,
        }
    }
}

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
    /// The connection type
    pub connection_type: u8,
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
    + 1 // connection_type
    + 64 // credential_data_a
    + 64 // credential_data_b
    + 1; // bump

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ConnectionErrorCode {
    pub code: u32,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid connection type")]
    InvalidConnectionType,
}

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
            entity_a.as_ref(),
            entity_b.as_ref(),
            auth_method.key().as_ref(),
        ],
        bump
    )]
    pub connection: Account<'info, Connection>,

    pub system_program: Program<'info, System>,
}

/// Context for updating connection status (activate/deactivate)
#[derive(Accounts)]
pub struct UpdateConnectionStatus<'info> {
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
        bump = auth_method.bump,
    )]
    pub auth_method: Account<'info, AuthMethod>,

    // connection
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
    )]
    pub connection: Account<'info, Connection>,
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
        connection_type: u8,
        entity_a: Pubkey,
        entity_b: Pubkey,
        credential_data_a: [u8; 64],
        credential_data_b: [u8; 64],
    ) -> Result<()> {
        // Validate the connection type
        ConnectionType::from_u8(connection_type)?;
        
        let connection = &mut ctx.accounts.connection;

        connection.created_at = Clock::get()?.unix_timestamp;
        connection.entity_a = entity_a;
        connection.entity_b = entity_b;
        connection.auth_method = ctx.accounts.auth_method.key();
        connection.connection_type = connection_type;
        connection.authority = ctx.accounts.caller.key();
        connection.is_active = true;
        connection.entity_a_credential_data = credential_data_a;
        connection.entity_b_credential_data = credential_data_b;
        connection.bump = ctx.bumps.connection;

        Ok(())
    }

    /// Revoke connection credentials by closing the account
    pub fn revoke_connection(_ctx: Context<RevokeConnection>) -> Result<()> {
        // Account will be automatically closed due to the `close = authority` constraint
        Ok(())
    }
}
