/// Denominator of BPS (Basis Points)
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Maximum length of a device model
pub const MAX_DEVICE_MODEL_LEN: usize = 64;

/// Maximum length of a device manufacturer
pub const MAX_DEVICE_MANUFACTURER_LEN: usize = 64;

/// Maximum length of a site name
pub const MAX_SITE_NAME_LEN: usize = 64;

// IPAM Constants
use anchor_lang::prelude::*;

/// IPAM Tier enum for different IP address allocation types
#[derive(Clone, Copy, AnchorSerialize, AnchorDeserialize, Debug, PartialEq, Eq)]
pub enum Tier {
    /// Subscriber addresses: 10.64.0.0/10 → unit = /32
    Subscriber = 0,
    /// Loopback addresses: 100.64.0.0/11 → unit = /32  
    Loopback = 1,
    /// Point-to-Point addresses: 100.96.0.0/11 → unit = /31 pair
    PtP = 2,
}

impl Tier {
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

    /// Get the base IPv4 address for this tier
    pub fn base_ipv4(&self) -> u32 {
        match self {
            Self::Subscriber => SUBSCRIBER_BASE,
            Self::Loopback => LOOPBACK_BASE,
            Self::PtP => PTP_BASE,
        }
    }

    /// Get the base prefix length for this tier
    pub fn base_prefix(&self) -> u8 {
        match self {
            Self::Subscriber => SUBSCRIBER_PREFIX,
            Self::Loopback => LOOPBACK_PREFIX,
            Self::PtP => PTP_PREFIX,
        }
    }

    /// Get the maximum number of blocks for this tier
    pub fn max_blocks(&self) -> u16 {
        match self {
            Self::Subscriber => MAX_BLOCKS_SUBSCRIBER,
            Self::Loopback | Self::PtP => MAX_BLOCKS_LOOPBACK_PTP,
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

    /// Get the number of root chunks needed for this tier
    pub fn root_chunks_count(&self) -> usize {
        (self.max_blocks() as usize + 63) / 64 // ceiling division
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

/// Subscriber address space: 10.64.0.0/10
pub const SUBSCRIBER_BASE: u32 = 0x0A400000; // 10.64.0.0
pub const SUBSCRIBER_PREFIX: u8 = 10;

/// Loopback address space: 100.64.0.0/11  
pub const LOOPBACK_BASE: u32 = 0x64400000; // 100.64.0.0
pub const LOOPBACK_PREFIX: u8 = 11;

/// Point-to-Point address space: 100.96.0.0/11
pub const PTP_BASE: u32 = 0x64600000; // 100.96.0.0
pub const PTP_PREFIX: u8 = 11;

/// IP Block size: /22 (1024 /32 units or 512 /31 pairs)
pub const BLOCK_PREFIX: u8 = 22;

/// Units per IP Block for /32 tiers (Subscriber, Loopback)
pub const UNITS_PER_BLOCK_32: u16 = 1024;

/// Units per IP Block for /31 tier (PtP)
pub const UNITS_PER_BLOCK_31: u16 = 512;

/// Chunks per IP Block for /32 tiers (1024 bits / 64 = 16 chunks)
pub const CHUNKS_PER_BLOCK_32: usize = 16;

/// Chunks per IP Block for /31 tier (512 bits / 64 = 8 chunks)
pub const CHUNKS_PER_BLOCK_31: usize = 8;

/// Maximum IP Blocks for Subscriber tier (/10 -> /22 = 4096 blocks)
pub const MAX_BLOCKS_SUBSCRIBER: u16 = 4096;

/// Maximum IP Blocks for Loopback/PtP tiers (/11 -> /22 = 2048 blocks)
pub const MAX_BLOCKS_LOOPBACK_PTP: u16 = 2048;
