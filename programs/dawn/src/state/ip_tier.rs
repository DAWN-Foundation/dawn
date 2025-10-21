use crate::constants::*;
use anchor_lang::prelude::*;

/// IPAM Tier enum for different IP address allocation types
#[derive(Clone, Copy, AnchorSerialize, AnchorDeserialize, Debug, PartialEq, Eq, InitSpace)]
pub enum IpTier {
    /// Subscriber addresses: 10.64.0.0/10 → unit = /32
    Subscriber = 0,
    /// Loopback addresses: 100.64.0.0/11 → unit = /32  
    Loopback = 1,
    /// Point-to-Point addresses: 100.96.0.0/11 → unit = /31 pair
    PtP = 2,
}

impl IpTier {
    /// Convert to u8 for seeds and storage
    pub fn to_u8(&self) -> u8 {
        *self as u8
    }

    /// Convert from u8
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(Self::Subscriber),
            1 => Some(Self::Loopback),
            2 => Some(Self::PtP),
            _ => None,
        }
    }

    /// Get the unit capacity per block for this tier
    pub fn unit_capacity(&self) -> u16 {
        match self {
            Self::Subscriber | Self::Loopback => UNITS_PER_BLOCK_32,
            Self::PtP => UNITS_PER_BLOCK_31,
        }
    }

    /// Get the number of chunks per block for this tier
    pub fn chunks_per_block(&self) -> usize {
        match self {
            Self::Subscriber | Self::Loopback => CHUNKS_PER_BLOCK_32,
            Self::PtP => CHUNKS_PER_BLOCK_31,
        }
    }

    /// Get the prefix length for individual units
    pub fn unit_prefix(&self) -> u8 {
        match self {
            Self::Subscriber | Self::Loopback => 32,
            Self::PtP => 31,
        }
    }

    /// Convert to seed bytes for PDA derivation
    pub fn to_seed(&self) -> [u8; 1] {
        [self.to_u8()]
    }
}
