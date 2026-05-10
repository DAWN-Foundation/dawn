use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

/// An AP (Access Point) authorized to act as a RADIUS authenticator on
/// an AccessDomain.
///
/// Identity is split between two values:
///   - `mac_address`: stable hardware identifier. Immutable; part of
///     the PDA seeds. Replacing the physical box (new MAC) creates a
///     new authenticator account.
///   - `current_pubkey`: Ed25519 TLS / Solana identity. Mutable via
///     `rotate_authenticator_pubkey`. In RadSec mode this is the key
///     wrapped in the AP's self-signed X.509 cert
///     (`SubjectPublicKeyInfo`); in plain-RADIUS mode it's recorded for
///     audit and forward-compatibility, while the actual RADIUS
///     shared secret lives off chain (Nautobot-pushed config).
///
/// PDA seeds: ["authenticator", access_domain, mac_address]
///
/// Field-offset layout (relevant for memcmp-filtered
/// `getProgramAccounts` scans from the SoT-bridge):
///   0..8    Anchor account discriminator
///   8..16   created_at (i64 LE)
///   16..48  access_domain (Pubkey)        ← scan filter for "my AD"
///   48..54  mac_address ([u8;6])          ← plain-RADIUS lookup
///   54..86  current_pubkey (Pubkey)       ← RadSec lookup
///   86..94  key_rotated_at (i64 LE)
///   94..127 device (Option<Pubkey>) — 1-byte tag + 32-byte pubkey
///   127..   label, expires_at, bump — variable offset; full-account
///           parse only.
#[account]
#[derive(InitSpace)]
pub struct AccessDomainAuthenticator {
    /// When the authenticator was first registered.
    pub created_at: i64,
    /// The AccessDomain this authenticator serves. Pinned at offset 16
    /// (8 byte disc + 8 byte created_at) so the bridge can do a single
    /// memcmp filter to enumerate all APs for a given AccessDomain.
    pub access_domain: Pubkey,
    /// AP hardware MAC address (EUI-48). Immutable — part of the PDA
    /// seeds. New MAC = new authenticator account.
    pub mac_address: [u8; 6],
    /// Current AP identity pubkey (Ed25519). Mutable via
    /// `rotate_authenticator_pubkey`. For RadSec: wrapped in the AP's
    /// self-signed X.509 cert SubjectPublicKeyInfo. For plain-RADIUS:
    /// recorded for audit only.
    pub current_pubkey: Pubkey,
    /// When `current_pubkey` was last set. Equals `created_at`
    /// initially; updated on each rotate.
    pub key_rotated_at: i64,
    /// Optional pointer to the Device CMDB record (when the operator
    /// tracks the hardware separately in the Device / LocalDomain
    /// inventory). None when the AP is registered as an authenticator
    /// only.
    pub device: Option<Pubkey>,
    /// Optional ops-friendly label. Mirrors the DomainAuthority
    /// convention. Examples: "lobby-ap-3", "rooftop-mesh-1".
    #[max_len(32)]
    pub label: Option<String>,
    /// Optional expiry (Unix seconds). None = no expiry. Use sites
    /// must reject the authenticator when
    /// `expires_at.is_some() && expires_at <= now`. Useful for
    /// time-boxed contractors / loaner hardware.
    pub expires_at: Option<i64>,
    /// PDA bump.
    pub bump: u8,
}

impl AccessDomainAuthenticator {
    pub const SEED_PREFIX: &'static [u8] = b"authenticator";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
