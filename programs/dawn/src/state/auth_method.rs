use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

use super::AuthMethodType;

/// Account structure for an authentication method scheme attached to an
/// access domain.
///
/// One AuthMethod per (AccessDomain, method_type, parameter set). Methods
/// are *not* bound to a specific Device — a 50-AP MPSK fleet uses one
/// AuthMethod, not 50.
///
/// `parameters[256]` is a fixed buffer holding the method-specific config
/// (PSKMethodParams, EAPMethodParams, etc.). Method-specific data-plane
/// key material — when relevant (IPsec AH, WPA2-Enterprise) — lives
/// inside this buffer alongside the rest of the method config.
#[account]
#[derive(InitSpace)]
pub struct AuthMethod {
    /// The creation timestamp
    pub created_at: i64,
    /// Operator who registered this method (must equal access_domain.owner
    /// at registration time).
    pub authority: Pubkey,
    /// The AccessDomain this method serves.
    pub access_domain: Pubkey,
    /// Which method this represents (maps to AuthMethodType enum).
    pub method_type: AuthMethodType,
    /// Method-specific parameters (fixed size buffer). For Psk/Mpsk see
    /// app/amf/psk_method.rs::PSKMethodParams.
    pub parameters: [u8; 256],
    /// PDA bump
    pub bump: u8,
}

impl AuthMethod {
    pub const SEED_PREFIX: &'static [u8] = b"auth_method";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
