use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};

use crate::app::DawnApp;
use crate::state::{AuthMethod, Connection};

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
            AuthMethod::SEED_PREFIX.as_ref(),
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
        space = Connection::SIZE,
        seeds = [
            Connection::SEED_PREFIX.as_ref(),
            auth_method.key().as_ref(),
            entity_a.as_ref(),
            entity_b.as_ref(),
        ],
        bump
    )]
    pub connection: Account<'info, Connection>,

    pub system_program: Program<'info, System>,
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
}
