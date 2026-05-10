use anchor_lang::prelude::*;

/// Authentication method types supported by the program.
///
/// Byte values are stable across schema versions: never reuse a byte
/// for a different variant. The `as_seed()` form is what the program
/// embeds in PDA derivations and what wire-protocol consumers should
/// expect.
///
/// Lean access-domain builds (production MPSK only) accept Psk + Mpsk
/// at registration time; the integrated branch retains the full set
/// for the wider commercial flows (EAP / WPA2-Enterprise / IPsec /
/// WPA3-Enterprise) that master shipped.
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub enum AuthMethodType {
    Psk,
    Mpsk,
    Wpa2Enterprise,
    Eap,
    IpsecAh,
    Wpa3Enterprise,
}

impl AuthMethodType {
    pub fn as_seed(&self) -> &[u8] {
        match self {
            Self::Psk => &[0],
            Self::Mpsk => &[1],
            Self::Wpa2Enterprise => &[2],
            Self::Eap => &[3],
            Self::IpsecAh => &[4],
            Self::Wpa3Enterprise => &[5],
        }
    }
}
