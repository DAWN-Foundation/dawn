use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// Per-customer credential on an AccessDomain.
///
/// Identity is `(access_domain, auth_method, authority)`. Subscription
/// and Plan links are *optional* — a credential can exist for a pure-BSS
/// access domain with no commercial relationship attached. When present,
/// they record the commercial context and gate the registrar (the signer
/// must equal `plan.subscription_creation_authority`).
///
/// `sealed_payload[128]` is a libsodium sealed-box envelope encrypted to
/// `access_domain.control_plane_device`'s Solana pubkey (Ed25519 →
/// Curve25519 conversion). Plaintext format is method-specific and
/// versioned; for MPSK it is the raw PSK with a small header. The on-
/// chain program never reads or validates this buffer; it is opaque
/// ciphertext.
#[derive(InitSpace)]
#[account]
pub struct Credential {
    /// The creation timestamp
    pub created_at: i64,
    /// The customer this credential is for.
    pub authority: Pubkey,
    /// The access domain.
    pub access_domain: Pubkey,
    /// The auth method scheme.
    pub auth_method: Pubkey,
    /// Optional commercial-relationship link.
    pub subscription: Option<Pubkey>,
    /// Optional plan link. Must be Some whenever subscription is Some.
    pub plan: Option<Pubkey>,
    /// Optional 802.1Q VLAN tag. Interpretation is operator-side; we
    /// store the raw u16 as provided.
    pub vlan_id: Option<u16>,
    /// Optional QoS class. u8 raw; convention (DSCP / 802.1p) is
    /// operator-side.
    pub qos_tag: Option<u8>,
    /// Sealed payload (libsodium sealed box envelope) encrypted to the
    /// AccessDomain's control_plane_device. Layout:
    ///   bytes  0..32   ephemeral X25519 public key
    ///   bytes 32..128  ciphertext || Poly1305 tag, zero-padded
    pub sealed_payload: [u8; 128],
    /// PDA bump
    pub bump: u8,
}

impl Credential {
    pub const SEED_PREFIX: &'static [u8] = b"credential";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
