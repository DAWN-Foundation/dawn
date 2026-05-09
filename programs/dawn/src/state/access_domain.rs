use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// The access-domain account.
///
/// First-class top-level account representing a logical access-plane
/// network (e.g. an MPSK SSID, an EAP-TLS realm, an IPsec policy domain).
///
/// Three Tier-1 attachments are referenced (intrinsic, identity-defining):
///   - `owner`: operator key. Authorizes creation and any subsequent change
///     to `gateway_device` / `control_plane_device`. Also authorizes
///     `grant_domain_authority` / `revoke_domain_authority` for delegating
///     Tier-2 roles (e.g. Registrar) to other keys.
///   - `control_plane_device`: Device PDA whose `owner` decrypts
///     `Credential.sealed_payload`. Conceptually the AAA appliance.
///     Required.
///   - `gateway_device`: optional Device PDA representing the upstream
///     data-plane gateway/router that forwards this access domain's
///     traffic (e.g. BNG, AP, building gateway). Optional because pure
///     BSS scenarios may not have a backhaul attachment yet.
///
/// `local_domain` is preserved for forward compatibility — local domains
/// are a management-plane concept distinct from the access plane and may
/// or may not be linked. Optional and unused by access-plane logic today.
///
/// `external_uuid` is a 16-byte handle for tying the access domain back
/// to an off-chain source-of-truth row (e.g. a record in the operator's
/// BSS database). Optional.
#[account]
#[derive(InitSpace)]
pub struct AccessDomain {
    /// The creation timestamp
    pub created_at: i64,
    /// Operator key. Sole authority for set_* updates and for granting/revoking
    /// Tier-2 DomainAuthority roles on this access domain.
    pub owner: Pubkey,
    /// Device PDA whose owner decrypts Credential.sealed_payload (the AAA
    /// appliance).
    pub control_plane_device: Pubkey,
    /// Optional Device PDA: the data-plane gateway. None for pure-BSS
    /// deployments without a backhaul attachment.
    pub gateway_device: Option<Pubkey>,
    /// Optional management-plane attachment. Reserved for future use;
    /// the access-plane logic does not read this field.
    pub local_domain: Option<Pubkey>,
    /// Optional external UUID (16 bytes) for tying back to an off-chain
    /// source of truth.
    pub external_uuid: Option<[u8; 16]>,
    /// SSID-like human label (max 32 bytes).
    #[max_len(32)]
    pub name: String,
    /// PDA bump seed
    pub bump: u8,
}

impl AccessDomain {
    pub const SEED_PREFIX: &'static [u8] = b"access_domain";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
