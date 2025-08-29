use crate::{constants::*, IpTier};
use anchor_lang::prelude::*;

/// Root IP Block that tracks fixed-size IP Blocks for a specific tier
/// Maintains global free summary and high-water mark for on-demand creation
#[account]
#[derive(InitSpace)]
pub struct RootIpBlock {
    /// Tier identifier (Subscriber, Loopback, PtP)
    pub tier: IpTier,
    /// Root block index within this tier
    pub index: u32,
    /// Base IPv4 address for this specific root block
    pub base_ipv4: u32,
    /// Base CIDR length for this root block
    pub base_cidr: u8,
    /// Block CIDR length (/22 - 1024 /32 or 512 /31 per IP Block)
    pub block_cidr: u8,
    /// Bitmap chunks - 1 bit per IP Block (1 = has free unit)
    /// Each root block now handles fewer blocks due to subdivision
    #[max_len(64)]
    pub root_chunks: Vec<u64>,
    /// Summary bitmap - 1 bit per root chunk (1 = that chunk != 0)
    pub root_summary64: u64,
    /// PDA bump seed
    pub bump: u8,
}

impl RootIpBlock {
    pub const SEED_PREFIX: &'static [u8] = b"root_ip_block";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;

    /// Initialize a new RootIpBlock for the given tier and sequence
    pub fn initialize(
        &mut self,
        tier: IpTier,
        index: u32,
        base_ipv4: u32,
        base_cidr: u8,
        bump: u8,
    ) -> Result<()> {
        self.tier = tier;
        self.index = index;
        self.base_ipv4 = base_ipv4;
        self.base_cidr = base_cidr;
        self.block_cidr = BLOCK_CIDR;
        self.root_chunks = vec![0u64; tier.root_chunks_count()];
        self.root_summary64 = 0;
        self.bump = bump;

        Ok(())
    }

    pub fn first_available_block_idx(&self) -> Option<u32> {
        if self.root_summary64 == u64::MAX {
            return None;
        }

        let j = self.root_summary64.trailing_ones() as u32;
        let c = self.root_chunks[j as usize];
        let k = c.trailing_ones() as u32; // bit within that chunk
        let block_idx = (j << 6) | k;
        Some(block_idx)
    }

    pub fn get_block_base_ipv4(&self, block_idx: u32) -> u32 {
        self.base_ipv4 + (block_idx << (32 - self.block_cidr as u32))
    }

    /// Mark a block as having free units
    pub fn mark_block_non_full(&mut self, block_idx: u32) {
        let j = (block_idx >> 6) as usize; // chunk index
        let k = (block_idx & 63) as usize; // bit within chunk

        if j < self.root_chunks.len() {
            self.root_chunks[j] &= !(1u64 << k);
            self.root_summary64 &= !(1u64 << j);
        }
    }

    /// Mark a block as full (no free units)
    pub fn mark_block_full(&mut self, block_idx: u32) {
        let j = (block_idx >> 6) as usize; // chunk index
        let k = (block_idx & 63) as usize; // bit within chunk

        if j < self.root_chunks.len() {
            self.root_chunks[j] |= 1u64 << k;
            if self.root_chunks[j] == u64::MAX {
                self.root_summary64 |= 1u64 << j;
            }
        }
    }

    pub fn is_block_full(&self, block_idx: u32) -> bool {
        let j = (block_idx >> 6) as usize; // chunk index
        let k = (block_idx & 63) as usize; // bit within chunk

        self.root_chunks[j] & (1u64 << k) == 0
    }

    pub fn has_free_blocks(&self) -> bool {
        self.root_summary64 != u64::MAX
    }
}
