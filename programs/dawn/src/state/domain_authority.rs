use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Tier-2 role grant on a domain (AccessDomain or DistributionDomain).
///
/// The domain pubkey identifies the parent; the program reads the typed
/// domain account at use time to verify kind. The `role` enum encodes
/// what the granted key is authorized to do.
///
/// PDA seeds: ["domain_authority", domain, role_byte, authority]
///
/// Auth model:
///   - `grant_domain_authority` is signed by `domain.owner`.
///   - `revoke_domain_authority` is signed by `domain.owner` (closes PDA).
///   - The "use" instruction (e.g. register_credential_for) verifies the
///     PDA exists, has the expected role, references the same domain,
///     and is not expired.
#[account]
#[derive(InitSpace)]
pub struct DomainAuthority {
    /// When the grant was created.
    pub created_at: i64,
    /// The parent domain (AccessDomain or DistributionDomain PDA).
    pub domain: Pubkey,
    /// The delegated key.
    pub authority: Pubkey,
    /// What this grant authorizes.
    pub role: DomainAuthorityRole,
    /// = domain.owner at the time of grant. Recorded for audit; the
    /// active owner check happens against the live domain account.
    pub created_by: Pubkey,
    /// Optional human label (max 32 chars). Useful for ops:
    /// "operator-api-prod", "msp-aaa-eu-west-1", etc.
    #[max_len(32)]
    pub label: Option<String>,
    /// Optional expiry (Unix seconds). None = no expiry. Use sites must
    /// reject the grant when `expires_at.is_some() && expires_at < now`.
    pub expires_at: Option<i64>,
    /// PDA bump.
    pub bump: u8,
}

impl DomainAuthority {
    pub const SEED_PREFIX: &'static [u8] = b"domain_authority";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}

/// Roles delegable on a domain. The byte mapping (used in PDA seeds) is
/// stable across schema versions: adding a variant only consumes the
/// next free byte; existing PDAs keep their seeds.
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, InitSpace,
)]
pub enum DomainAuthorityRole {
    /// Mint / revoke Credentials. Applies to AccessDomain.
    Registrar,
    /// Update existing AuthMethod params (e.g. drop a band, rotate the
    /// rotation interval). Applies to AccessDomain. Operational ops
    /// role for day-to-day config-plane management.
    ConfigPlaneManager,
    /// Register / rotate / revoke AccessDomainAuthenticator records
    /// (Access Points) on an AccessDomain. Operationally held by the
    /// cold-admin-adjacent orchestrator (e.g. Nautobot) so per-AP
    /// onboarding doesn't require the cold-admin signing key. Cannot
    /// mint customer credentials or mutate AccessDomain fields — narrow
    /// blast radius compared to the cold admin.
    InfrastructureRegistrar,
    // Future variants — add as roles are needed:
    //   AuthMethodManager,    // register/replace AuthMethods (AccessDomain)
    //   PlanCreator,          // create Plans on this domain
    //   AdminDeputy,          // bundle of all delegable powers
}

impl DomainAuthorityRole {
    /// Single-byte seed form for the PDA. Stable across schema versions:
    /// the byte mapping must never change for an existing variant.
    pub fn as_seed(&self) -> &[u8] {
        match self {
            Self::Registrar => &[0],
            Self::ConfigPlaneManager => &[1],
            Self::InfrastructureRegistrar => &[2],
        }
    }
}
