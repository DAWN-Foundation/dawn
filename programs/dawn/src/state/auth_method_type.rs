use anchor_lang::prelude::*;

/// Authentication method types supported by the access-domain build.
///
/// Lean build: Psk and Mpsk only. Other 802.11 / IPsec / EAP variants
/// are reserved for a future enrichment of the schema and not currently
/// accepted by `register_auth_method`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub enum AuthMethodType {
    Psk,
    Mpsk,
}

impl AuthMethodType {
    /// Single-byte seed form for PDA derivation. Stable across schema
    /// versions: never reuse a byte for a different variant.
    pub fn as_seed(&self) -> &[u8] {
        match self {
            Self::Psk => &[0],
            Self::Mpsk => &[1],
        }
    }
}
