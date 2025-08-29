use anchor_lang::prelude::*;

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
