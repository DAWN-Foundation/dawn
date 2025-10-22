use crate::{constants::*, IpTier};
use anchor_lang::prelude::*;

/// Root IP Block that tracks fixed-size IP Blocks for a specific tier
/// Maintains global free summary and high-water mark for on-demand creation
#[account]
#[derive(InitSpace)]
pub struct RootIpBlock {
    /// The creation timestamp
    pub created_at: i64,
    /// Tier identifier (Subscriber, Loopback, PtP)
    pub tier: IpTier,
    /// Authority that can approve or reject allocation requests
    pub authority: Pubkey,
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
    /// Index of the first available block (cached for O(1) lookup)
    pub first_available_block_idx: Option<u32>,
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
        authority: Pubkey,
        index: u32,
        base_ipv4: u32,
        base_cidr: u8,
        bump: u8,
    ) -> Result<()> {
        self.created_at = Clock::get()?.unix_timestamp;
        self.tier = tier;
        self.authority = authority;
        self.index = index;
        self.base_ipv4 = base_ipv4;
        self.base_cidr = base_cidr;
        self.block_cidr = BLOCK_CIDR;

        // Calculate number of blocks dynamically based on base_cidr and block_cidr
        // Number of blocks = 2^(block_cidr - base_cidr)
        let num_blocks = if BLOCK_CIDR > base_cidr {
            1u32 << (BLOCK_CIDR - base_cidr)
        } else {
            1u32
        };

        // Calculate number of chunks needed (1 bit per block, 64 blocks per chunk)
        let num_chunks = ((num_blocks + 63) / 64) as usize;
        let num_chunks_capped = num_chunks.min(64); // Cap at 64 chunks (4096 blocks max)

        self.root_chunks = vec![0u64; num_chunks_capped];
        self.root_summary64 = 0;
        self.first_available_block_idx = Some(0); // Start with block 0 as first available
        self.bump = bump;

        Ok(())
    }

    pub fn find_first_available_block_idx(&self) -> Option<u32> {
        if self.root_summary64 == u64::MAX {
            return None;
        }

        // Find first chunk that is not completely full
        for j in 0..self.root_chunks.len() {
            let chunk = self.root_chunks[j];
            if chunk != u64::MAX {
                // Found a chunk with available blocks, find first 0 bit (available)
                let k = chunk.trailing_zeros() as u32;
                let block_idx = (j as u32) << 6 | k;
                return Some(block_idx);
            }
        }
        None
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
            self.first_available_block_idx = self.find_first_available_block_idx();
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

            self.first_available_block_idx = self.find_first_available_block_idx();
        }
    }

    pub fn is_block_full(&self, block_idx: u32) -> bool {
        let j = (block_idx >> 6) as usize; // chunk index
        let k = (block_idx & 63) as usize; // bit within chunk

        self.root_chunks[j] & (1u64 << k) != 0
    }

    pub fn has_free_blocks(&self) -> bool {
        self.root_summary64 != u64::MAX
    }
}
