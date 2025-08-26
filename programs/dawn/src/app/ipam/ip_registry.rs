use crate::{constants::MAX_ROOT_BLOCKS, DawnError, Tier};
use anchor_lang::prelude::*;

/// Registry that tracks all root blocks for a tier and provides allocation routing
#[account]
pub struct IpRegistry {
    /// Tier identifier
    pub tier: Tier,
    /// Authority that can manage root blocks
    pub authority: Pubkey,
    /// Current number of root blocks for this tier
    pub root_block_count: u32,
    /// Next root block sequence number to create
    pub next_index: u32,
    /// Bitmap tracking which root blocks have capacity (1 = has free blocks)
    /// Max 64 root blocks per tier (can be expanded later)
    pub root_availability_bitmap: u64,
    /// PDA bump seed
    pub bump: u8,
}

pub const IP_REGISTRY_SIZE: usize = 8 // discriminator
    + 1 // tier (stored as u8)
    + 32 // authority
    + 4 // root_block_count
    + 4 // next_index
    + 8 // root_availability_bitmap
    + 1; // bump

impl IpRegistry {
    /// Initialize a new IpRegistry
    pub fn initialize(&mut self, tier: Tier, authority: Pubkey, bump: u8) -> Result<()> {
        self.tier = tier;
        self.authority = authority;
        self.root_block_count = 0;
        self.next_index = 0;
        self.root_availability_bitmap = 0;
        self.bump = bump;

        Ok(())
    }

    /// Find the first root block with available capacity
    pub fn find_available_root_block(&self) -> Option<u32> {
        if self.root_availability_bitmap == 0 {
            return None;
        }

        Some(self.root_availability_bitmap.trailing_zeros())
    }

    /// Mark a root block as having/not having capacity
    pub fn update_root_availability(&mut self, sequence: u32, has_capacity: bool) {
        if sequence >= 64 {
            return; // Bitmap only supports 64 root blocks
        }

        if has_capacity {
            self.root_availability_bitmap |= 1u64 << sequence;
        } else {
            self.root_availability_bitmap &= !(1u64 << sequence);
        }
    }

    /// Register a new root block
    pub fn register_root_block(&mut self) -> Result<()> {
        require!(
            self.next_index < MAX_ROOT_BLOCKS,
            DawnError::SequenceOutOfBounds
        );
        self.update_root_availability(self.next_index, true);
        self.root_block_count += 1;
        self.next_index += 1;

        Ok(())
    }
}
