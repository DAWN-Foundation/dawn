use anchor_lang::prelude::*;

use crate::constants::{DISCRIMINATOR_SIZE, MAX_DEVICE_MANUFACTURER_LEN, MAX_DEVICE_MODEL_LEN};

/// The device model account, representing a device model
#[account]
#[derive(InitSpace)]
pub struct DeviceModel {
    /// The creation timestamp
    pub created_at: i64,
    /// The type of device
    pub device_type: DeviceType,
    /// Device manufacturer name
    #[max_len(MAX_DEVICE_MANUFACTURER_LEN)]
    pub manufacturer: String,
    /// Specific model identifier
    #[max_len(MAX_DEVICE_MODEL_LEN)]
    pub model: String,
    /// PDA bump seed
    pub bump: u8,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug, PartialEq, Eq, InitSpace)]
pub enum DeviceType {
    /// router device type
    Router,
    /// wireless radio device type
    WirelessRadio,
}

impl DeviceModel {
    pub const SEED_PREFIX: &'static [u8] = b"device_model";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}

impl DeviceType {
    pub fn to_seed(&self) -> &[u8] {
        match self {
            Self::Router => &[0],
            Self::WirelessRadio => &[1],
        }
    }
}
