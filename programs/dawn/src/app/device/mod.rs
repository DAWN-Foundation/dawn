use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

mod access_domain;
#[allow(clippy::module_inception)]
mod device;
// mod ip_pool;
mod location;
mod model;
mod site;
mod organization;

pub use access_domain::*;
pub use device::*;
// pub use ip_pool::*;
pub use location::*;
pub use model::*;
pub use site::*;
pub use organization::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug, PartialEq, Eq)]
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
