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

    /// Get the number of root chunks needed for this tier (legacy - for full tier)
    pub fn root_chunks_count(&self) -> usize {
        match self {
            Self::Subscriber | Self::Loopback => ROOT_CHUNKS_PER_BLOCK_32,
            Self::PtP => ROOT_CHUNKS_PER_BLOCK_31,
        }
    }

    /// Get the number of root chunks per subdivided root block
    pub fn root_chunks_count_per_root_block(&self) -> usize {
        match self {
            // Each root block now handles 1/16 or 1/8 of the original space
            Self::Subscriber => ROOT_CHUNKS_PER_BLOCK_32 / 16, // 64/16 = 4 chunks per root block
            Self::Loopback => ROOT_CHUNKS_PER_BLOCK_32 / 8,    // 64/8 = 8 chunks per root block
            Self::PtP => ROOT_CHUNKS_PER_BLOCK_31 / 8,         // 32/8 = 4 chunks per root block
        }
    }

    /// Get the address space size per root block
    pub fn addresses_per_root_block(&self) -> u32 {
        match self {
            // Subscriber: 10.64.0.0/10 = 64M addresses
            // Divide into 16 root blocks of 4M addresses each (/10 → /14)
            Self::Subscriber => 1 << (32 - 14), // 4M addresses per root

            // Loopback: 100.64.0.0/11 = 32M addresses
            // Divide into 8 root blocks of 4M addresses each (/11 → /14)
            Self::Loopback => 1 << (32 - 14), // 4M addresses per root

            // PtP: 100.96.0.0/11 = 32M addresses
            // Divide into 8 root blocks of 4M addresses each (/11 → /14)
            Self::PtP => 1 << (32 - 14), // 4M addresses per root
        }
    }

    /// Get the root block CIDR (/14 for all tiers)
    pub fn root_block_cidr(&self) -> u8 {
        14
    }

    /// Get maximum number of root blocks per tier
    pub fn max_root_blocks(&self) -> u32 {
        match self {
            Self::Subscriber => 16,          // 10.64.0.0/10 → 16 x /14 blocks
            Self::Loopback | Self::PtP => 8, // /11 → 8 x /14 blocks
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

    /// Validate base_ipv4 and base_cidr are reasonable and won't cause overflow
    /// This is a sanity check to prevent IPv4 calculation overflow
    pub fn validate_base_ipv4(&self, base_ipv4: u32, base_cidr: u8) -> Result<()> {
        use crate::DawnError;
        
        // Ensure CIDR is valid (between 0 and 32)
        require!(base_cidr <= 32, DawnError::InvalidCidr);
        
        // Calculate the network size for this CIDR
        let network_size = if base_cidr < 32 {
            1u64 << (32 - base_cidr)
        } else {
            1u64
        };
        
        // Ensure base_ipv4 is aligned to the network boundary
        // For example, a /14 network should be aligned to 2^18 = 262144 addresses
        if base_cidr < 32 {
            let alignment = 1u32 << (32 - base_cidr);
            let mask = !(alignment - 1);
            
            require!(
                base_ipv4 == (base_ipv4 & mask),
                DawnError::IPv4NotAligned
            );
        }
        
        // Verify that base_ipv4 + network_size won't overflow u32::MAX
        let base_u64 = base_ipv4 as u64;
        let max_ipv4 = base_u64
            .checked_add(network_size)
            .ok_or(DawnError::IPv4Overflow)?;
        
        require!(
            max_ipv4 <= (u32::MAX as u64) + 1,
            DawnError::IPv4RangeExceedsMax
        );
        
        Ok(())
    }
}
