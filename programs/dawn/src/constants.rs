/// Denominator of BPS (Basis Points)
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Maximum length of a device model
pub const MAX_DEVICE_MODEL_LEN: usize = 64;

/// Maximum length of a device manufacturer
pub const MAX_DEVICE_MANUFACTURER_LEN: usize = 64;

/// Maximum length of a site name
pub const MAX_SITE_NAME_LEN: usize = 64;

/// IP Block size: /22 (1024 /32 units or 512 /31 pairs)
pub const BLOCK_CIDR: u8 = 22;

/// Units per IP Block for /32 tiers (Subscriber, Loopback)
pub const UNITS_PER_BLOCK_32: u16 = 1024;

/// Units per IP Block for /31 tier (PtP)
pub const UNITS_PER_BLOCK_31: u16 = 512;

/// Chunks per IP Block for /32 tiers (1024 bits / 64 = 16 chunks)
pub const CHUNKS_PER_BLOCK_32: usize = 16;

/// Chunks per IP Block for /31 tier (512 bits / 64 = 8 chunks)
pub const CHUNKS_PER_BLOCK_31: usize = 8;

/// Root chunks per IP Block for /32 tiers (1024 bits / 64 = 16 chunks)
pub const ROOT_CHUNKS_PER_BLOCK_32: usize = 64;

/// Root chunks per IP Block for /31 tier (512 bits / 64 = 8 chunks)
pub const ROOT_CHUNKS_PER_BLOCK_31: usize = 32;

/// Maximum IP Blocks for Subscriber tier (/10 -> /22 = 4096 blocks)
pub const MAX_BLOCKS_SUBSCRIBER: u16 = 4096;

/// Maximum IP Blocks for Loopback/PtP tiers (/11 -> /22 = 2048 blocks)
pub const MAX_BLOCKS_LOOPBACK_PTP: u16 = 2048;

pub const MAX_ROOT_BLOCKS: u32 = 64;

pub const DISCRIMINATOR_SIZE: usize = 8;
