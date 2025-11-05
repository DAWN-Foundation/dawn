use anchor_lang::prelude::*;

use crate::{
    app::DawnApp,
    events::CredentialRegistered,
    state::{AuthMethod, Credential},
    utils::hash_parameters,
};

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
            AuthMethod::SEED_PREFIX.as_ref(),
            auth_method.authority.as_ref(),
            &auth_method.method_type.as_seed(),
            auth_method.device.as_ref(),
            &hash_parameters(&auth_method.parameters),
        ],
        bump = auth_method.bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        init,
        payer = caller,
        space = Credential::SIZE,
        seeds = [
            Credential::SEED_PREFIX.as_ref(),
            auth_method.key().as_ref(),
            client.key().as_ref(),
        ],
        bump
    )]
    pub credential: Account<'info, Credential>,

    pub system_program: Program<'info, System>,
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

        emit!(CredentialRegistered {
            credential: credential.key(),
            auth_method: credential.auth_method,
            client: credential.client,
            credential_data: credential.credential_data,
            created_at: credential.created_at,
        });

        Ok(())
    }
}
