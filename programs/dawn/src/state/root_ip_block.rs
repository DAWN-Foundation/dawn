use crate::{constants::*, error::DawnError, IpTier};
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
    /// Bitmap chunks - 1 bit per IP Block (0 = free, 1 = full)
    /// Each root block now handles fewer blocks due to subdivision
    #[max_len(64)]
    pub root_chunks: Vec<u64>,
    /// Summary bitmap - 1 bit per root chunk (0 = has free blocks, 1 = full)
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

        // Enforce hard limit instead of silent truncation
        require!(num_chunks <= 64, DawnError::TooManyBlocks);

        // Initialize chunks with all blocks marked as free (0 = free)
        self.root_chunks = vec![0u64; num_chunks];

        // Pre-mark non-representable bits in the last chunk as full
        if num_blocks % 64 != 0 {
            let last_chunk_idx = num_chunks - 1;
            let valid_bits = num_blocks % 64;
            // Mark bits [valid_bits..64) as full (1 = full)
            let invalid_mask = u64::MAX << valid_bits;
            self.root_chunks[last_chunk_idx] = invalid_mask;
        }

        // Initialize root_summary64: mark non-existent chunk positions as full
        if num_chunks < 64 {
            // Mark bits [num_chunks..64) as full (1 = full chunk)
            let invalid_chunks_mask = u64::MAX << num_chunks;
            self.root_summary64 = invalid_chunks_mask;
        } else {
            self.root_summary64 = 0; // all 64 chunks exist and are free
        }

        self.first_available_block_idx = Some(0); // Start with block 0 as first available
        self.bump = bump;

        Ok(())
    }

    /// Helper method to calculate num_blocks from stored metadata
    fn calculate_num_blocks(&self) -> u32 {
        // num_blocks = 2^(BLOCK_CIDR - base_cidr) or 1 if BLOCK_CIDR <= base_cidr
        if BLOCK_CIDR > self.base_cidr {
            1u32 << (BLOCK_CIDR - self.base_cidr)
        } else {
            1u32
        }
    }

    pub fn find_first_available_block_idx(&self) -> Option<u32> {
        // Check if all chunks are full using root summary
        if self.root_summary64 == u64::MAX {
            return None;
        }

        // Find first chunk with free blocks
        for j in 0..self.root_chunks.len() {
            let chunk = self.root_chunks[j];

            // Skip full chunks
            if chunk == u64::MAX {
                continue;
            }

            // Find first free bit (0 = free) by inverting and using trailing_zeros
            let free_bits = !chunk;
            let k = free_bits.trailing_zeros() as u32;

            // Construct block index
            let block_idx = (j as u32) << 6 | k;

            // Validate that block_idx is within representable range
            // This prevents returning indices for pre-marked invalid bits
            let num_blocks = self.calculate_num_blocks();
            if block_idx < num_blocks {
                return Some(block_idx);
            }
        }

        None
    }

    pub fn get_block_base_ipv4(&self, block_idx: u32) -> u32 {
        self.base_ipv4 + (block_idx << (32 - self.block_cidr as u32))
    }

    /// Checked version of get_block_base_ipv4 that validates block_idx bounds
    pub fn get_block_base_ipv4_checked(&self, block_idx: u32) -> Result<u32> {
        let num_blocks = self.calculate_num_blocks();
        require!(block_idx < num_blocks, DawnError::InvalidBlockIndex);
        Ok(self.get_block_base_ipv4(block_idx))
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
