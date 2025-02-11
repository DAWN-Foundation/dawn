use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

mod device;
mod ip_pool;
mod location;
mod model;
mod site;

pub use device::*;
pub use ip_pool::*;
pub use location::*;
pub use model::*;
pub use site::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum DeviceType {
    /// router device type
    Router,
    /// wireless radio device type
    WirelessRadio,
}

impl DeviceType {
    pub fn to_seed(&self) -> &[u8] {
        match self {
            Self::Router => &[0],
            Self::WirelessRadio => &[1],
        }
    }
}
