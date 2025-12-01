use anchor_lang::prelude::*;

use crate::{
    app::DawnApp,
    events::ConnectionRevoked,
    state::{AuthMethod, Connection},
    utils::hash_parameters,
};

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
            AuthMethod::SEED_PREFIX.as_ref(),
            auth_method.authority.as_ref(),
            &auth_method.method_type.as_seed(),
            auth_method.device.as_ref(),
            &hash_parameters(&auth_method.parameters),
        ],
        bump = auth_method.bump,
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        mut,
        constraint = connection.auth_method == auth_method.key(),
        seeds = [
            Connection::SEED_PREFIX,
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
    /// Revoke connection credentials by closing the account
    pub fn revoke_connection(ctx: Context<RevokeConnection>) -> Result<()> {
        // Account will be automatically closed due to the `close = authority` constraint
        let connection = &ctx.accounts.connection;
        let auth_method = &ctx.accounts.auth_method;

        emit!(ConnectionRevoked {
            connection: connection.key(),
            auth_method: auth_method.key(),
            revoked_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}
