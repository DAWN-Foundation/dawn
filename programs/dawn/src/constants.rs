/// Denominator of BPS (Basis Points)
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Maximum length of a device model
pub const MAX_DEVICE_MODEL_LEN: usize = 64;

/// Maximum length of a device manufacturer
pub const MAX_DEVICE_MANUFACTURER_LEN: usize = 64;

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

/// Maximum root blocks per tier (flexible base_ipv4/base_cidr design)
/// Note: IpRegistry bitmap only tracks first 64 for availability
pub const MAX_ROOT_BLOCKS: u32 = 256;

pub const DISCRIMINATOR_SIZE: usize = 8;

/// Maximum deadline offset from current time (1 hour in seconds)
/// This prevents transactions from being valid too far in the future
pub const MAX_DEADLINE_OFFSET_SECONDS: i64 = 3600;

/// Minimum slippage tolerance for min_dawn_out validation (500 bps = 5%)
/// Users must specify at least 5% below expected output to allow for some slippage
pub const MIN_SLIPPAGE_TOLERANCE_BPS: u64 = 500;
