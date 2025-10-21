use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};

use crate::{
    app::amf::{
        eap_method::EAPMethodParams, ipsec_method::IPsecAHParams, psk_method::PSKMethodParams,
    },
    error::DawnError,
    events::AuthMethodRegistered,
    state::{AuthMethod, AuthMethodType, Config, Device},
    utils::optional_pubkey_seed,
    DawnApp,
};

/// Context for registering a new authentication method
#[derive(Accounts)]
#[instruction(method_type: AuthMethodType, parameters: [u8; 256])]
pub struct RegisterAuthMethod<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = caller,
        space = AuthMethod::SIZE,
        seeds = [
            AuthMethod::SEED_PREFIX.as_ref(),
            caller.key().as_ref(),
            method_type.as_seed(),
            &parameters[..MAX_SEED_LEN],
        ],
        bump
    )]
    pub auth_method: Account<'info, AuthMethod>,

    #[account(
        constraint = device.owner == caller.key(),
        seeds = [
            Device::SEED_PREFIX.as_ref(),
            caller.key().as_ref(),
            device.model.as_ref(),
            &device.name.as_ref(),
            &device.mac_address,
        ],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Register a new authentication method
    pub fn register_auth_method(
        ctx: Context<RegisterAuthMethod>,
        method_type: AuthMethodType,
        parameters: [u8; 256],
    ) -> Result<()> {
        // VALIDATE parameters before storing
        validate_auth_params(method_type, &parameters)?;

        let auth_method = &mut ctx.accounts.auth_method;
        let now = Clock::get()?.unix_timestamp;

        auth_method.created_at = now;
        auth_method.authority = ctx.accounts.caller.key();
        auth_method.method_type = method_type;
        auth_method.device = ctx.accounts.device.key();
        auth_method.parameters = parameters;
        auth_method.bump = ctx.bumps.auth_method;

        emit!(AuthMethodRegistered {
            auth_method: auth_method.key(),
            method_type: auth_method.method_type as u8,
            device: auth_method.device,
            parameters: auth_method.parameters,
            created_at: now,
        });

        Ok(())
    }
}

pub fn validate_auth_params(method_type: AuthMethodType, parameters: &[u8; 256]) -> Result<()> {
    match method_type {
        AuthMethodType::Psk | AuthMethodType::Mpsk => {
            // PSK params: 32 + 1 + 1 + 4 + 64 = 102 bytes
            let params = PSKMethodParams::try_from_slice(&parameters[..102])
                .map_err(|_| error!(DawnError::InvalidAuthMethodType))?;
            params.validate()?;
        }
        AuthMethodType::Eap | AuthMethodType::Wpa2Enterprise | AuthMethodType::Wpa3Enterprise => {
            // EAP params: Calculate exact size (32 + 1 + 1 + 32 + 2 + 4 + 1 + 1 + 64 = 138 bytes)
            let params = EAPMethodParams::try_from_slice(&parameters[..138])
                .map_err(|_| error!(DawnError::InvalidAuthMethodType))?;
            params.validate()?;
        }
        AuthMethodType::IpsecAh => {
            // IPsec AH params: 1 + 4 + 1 + 4 + 1 + 1 + (1+1+1+1+1+4) + 64 = 85 bytes
            let params = IPsecAHParams::try_from_slice(&parameters[..85])
                .map_err(|_| error!(DawnError::InvalidAuthMethodType))?;
            params.validate()?;
        }
        _ => {
            return Err(error!(DawnError::InvalidAuthMethodType));
        }
    }

    Ok(())
}
