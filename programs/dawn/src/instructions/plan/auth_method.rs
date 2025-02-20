use anchor_lang::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub enum AuthMethod {
    Psk,
    Mpsk,
    Wpa2Enterprise,
    _8021x,
    IpsecAh,
    Wpa3Enterprise,
}

impl AuthMethod {
    pub fn to_seed(&self) -> &[u8] {
        match self {
            Self::Psk => &[0],
            Self::Mpsk => &[1],
            Self::Wpa2Enterprise => &[2],
            Self::_8021x => &[3],
            Self::IpsecAh => &[4],
            Self::Wpa3Enterprise => &[5],
        }
    }
}
