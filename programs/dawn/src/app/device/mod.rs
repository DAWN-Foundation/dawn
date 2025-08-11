use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

mod access_domain;
#[allow(clippy::module_inception)]
mod device;
mod distribution_domain;
// mod ip_pool;
mod local_domain;
mod location;
mod model;
mod organization;
mod site;

pub use access_domain::*;
pub use device::*;
pub use distribution_domain::*;
// pub use ip_pool::*;
pub use local_domain::*;
pub use location::*;
pub use model::*;
pub use organization::*;
pub use site::*;

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
