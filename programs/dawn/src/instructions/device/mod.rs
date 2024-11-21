use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

mod device;
mod model;

pub use device::*;
pub use model::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum DeviceType {
    /// router device type
    Router,
    /// wireless radio device type
    WirelessRadio,
}

impl From<usize> for DeviceType {
    fn from(value: usize) -> Self {
        match value {
            0 => Self::Router,
            1 => Self::WirelessRadio,
            _ => Self::Router,
        }
    }
}
