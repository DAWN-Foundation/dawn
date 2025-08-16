use anchor_lang::prelude::*;
use crate::{
    constants::*,
    DawnApp, DawnError,
};

use super::RootIpBlock;

/// IP Block with per-block bitmap and micro-index for O(1) discovery
/// Lazily created when needed by the allocator
#[account]
pub struct IpBlock {
    /// Tier identifier (Subscriber, Loopback, PtP)
    pub tier: Tier,
    /// Block base IP address (aligned to block_prefix /22)
    pub block_base: u32,
    /// Block prefix length (/22)
    pub block_prefix: u8,
    /// Unit capacity: /32 tiers: 1024; PtP: 512
    pub unit_capacity: u16,
    /// Current number of free units in this block
    pub free_units: u16,
    /// Bitmap chunks for unit allocation
    /// /32: 1024 bits → 16 chunks; PtP: 512 bits → 8 chunks
    pub slots_chunks: Vec<u64>,
    /// Chunk free bitmap: 1 bit per chunk (1 = chunk has free units)
    /// /32 uses 16 bits; PtP uses lower 8 bits
    pub chunk_free_bitmap: u16,
    /// PDA bump seed
    pub bump: u8,
}

impl IpBlock {
    /// Calculate account size for a specific tier
    pub fn calculate_size(tier: Tier) -> usize {
        let chunks_per_block = tier.chunks_per_block();
        
        8 // discriminator
            + 1 // tier (stored as u8)
            + 4 // block_base
            + 1 // block_prefix
            + 2 // unit_capacity
            + 2 // free_units
            + 4 + (chunks_per_block * 8) // slots_chunks Vec<u64>
            + 2 // chunk_free_bitmap
            + 1 // bump
    }

    /// Initialize a new IP Block
    pub fn initialize(&mut self, tier: Tier, block_base: u32, bump: u8) -> Result<()> {
        self.tier = tier;
        self.block_base = block_base;
        self.block_prefix = BLOCK_PREFIX;
        self.unit_capacity = tier.unit_capacity();
        self.free_units = tier.unit_capacity();
        self.slots_chunks = vec![0u64; tier.chunks_per_block()];
        
        // Initialize chunk_free_bitmap with all chunks marked as free
        self.chunk_free_bitmap = match tier {
            Tier::Subscriber | Tier::Loopback => 0xFFFF, // 16 bits all set
            Tier::PtP => 0x00FF, // lower 8 bits set
        };
        
        self.bump = bump;

        Ok(())
    }

    /// Select the first free unit in this block using chunk operations
    /// Returns (unit_idx, chunk_idx, bit_idx) or None if block is full
    pub fn select_unit(&self) -> Option<(u32, u32, u32)> {
        if self.chunk_free_bitmap == 0 {
            return None;
        }

        let chunk_idx = self.chunk_free_bitmap.trailing_zeros() as u32;
        let chunk = self.slots_chunks[chunk_idx as usize];
        let bit_idx = (!chunk).trailing_zeros() as u32;
        
        if bit_idx >= 64 {
            return None; // This shouldn't happen if chunk_free_bitmap is correct
        }

        let unit_idx = (chunk_idx << 6) | bit_idx;
        Some((unit_idx, chunk_idx, bit_idx))
    }

    pub fn first_available_ipv4(&self) -> [u8; 4] {
        let chunk_idx = self.chunk_free_bitmap.trailing_zeros() as u32;
        let chunk = self.slots_chunks[chunk_idx as usize];
        let bit_idx = (!chunk).trailing_zeros() as u32;
        let unit_idx = (chunk_idx << 6) | bit_idx;
        self.unit_idx_to_ipv4_bytes(unit_idx)
    }

    /// Allocate a unit by setting the corresponding bit
    pub fn allocate_unit(&mut self, chunk_idx: u32, bit_idx: u32) -> Result<()> {
        if chunk_idx as usize >= self.slots_chunks.len() || bit_idx >= 64 {
            return Err(DawnError::InvalidUnitIndex.into());
        }

        // Set the bit
        self.slots_chunks[chunk_idx as usize] |= 1u64 << bit_idx;
        self.free_units = self.free_units.saturating_sub(1);

        // If chunk became full, clear the corresponding bit in chunk_free_bitmap
        if self.slots_chunks[chunk_idx as usize] == !0u64 {
            self.chunk_free_bitmap &= !(1u16 << chunk_idx);
        }

        Ok(())
    }

    pub fn allocate_first_available(&mut self) -> Result<(u32, [u8; 4])> {
        let (unit_idx, chunk_idx, bit_idx) = self.select_unit().ok_or(DawnError::CapacityExhausted)?; 

        // Set the bit
        self.slots_chunks[chunk_idx as usize] |= 1u64 << bit_idx;
        self.allocate_unit(chunk_idx, bit_idx)?;
        self.free_units = self.free_units.saturating_sub(1);

        // If chunk became full, clear the corresponding bit in chunk_free_bitmap
        if self.slots_chunks[chunk_idx as usize] == !0u64 {
            self.chunk_free_bitmap &= !(1u16 << chunk_idx);
        }

        Ok((unit_idx, self.unit_idx_to_ipv4_bytes(unit_idx)))
    }

    pub fn ipv4_bytes_to_unit(&self, ipv4: [u8; 4]) -> Option<u32> {
        let ipv4 = u32::from_be_bytes(ipv4);
        self.ipv4_to_unit(ipv4)
    }

    pub fn release(&mut self, unit_idx: u32) -> Result<bool> {
        let (chunk_idx, bit_idx) = self.unit_to_indices(unit_idx);
        if chunk_idx as usize >= self.slots_chunks.len() || bit_idx >= 64 {
            return Err(DawnError::InvalidUnitIndex.into());
        }

        let was_full_chunk = self.slots_chunks[chunk_idx as usize] == !0u64;
        
        // Clear the bit
        self.slots_chunks[chunk_idx as usize] &= !(1u64 << bit_idx);
        self.free_units = self.free_units.saturating_add(1);

        // If chunk was full before, mark it as having free space
        if was_full_chunk {
            self.chunk_free_bitmap |= 1u16 << chunk_idx;
        }

        // Return true if this was the first free unit (block was full before)
        Ok(self.free_units == 1)
    }

    /// Check if this block is full
    pub fn is_full(&self) -> bool {
        self.free_units == 0
    }

    /// Calculate the IPv4 address for a given unit index
    pub fn unit_idx_to_ipv4(&self, unit_idx: u32) -> u32 {
        match self.tier {
            Tier::Subscriber | Tier::Loopback => {
                // For /32 tiers, each unit is a /32 address
                self.block_base + unit_idx
            }
            Tier::PtP => {
                // For /31 tier, each unit represents a /31 pair
                // Return the base address of the /31 pair (even address)
                self.block_base + (unit_idx << 1)
            }
        }
    }

    pub fn unit_idx_to_ipv4_bytes(&self, unit_idx: u32) -> [u8; 4] {
        let ipv4 = self.unit_idx_to_ipv4(unit_idx);
        ipv4.to_be_bytes()
    }

    /// Calculate unit index from IPv4 address
    pub fn ipv4_to_unit(&self, ipv4: u32) -> Option<u32> {
        if ipv4 < self.block_base {
            return None;
        }

        let offset = ipv4 - self.block_base;
        let unit_idx = match self.tier {
            Tier::Subscriber | Tier::Loopback => offset,
            Tier::PtP => offset >> 1, // For /31, divide by 2
        };

        if unit_idx >= self.unit_capacity as u32 {
            None
        } else {
            Some(unit_idx)
        }
    }

    /// Get chunk and bit indices from unit index
    pub fn unit_to_indices(&self, unit_idx: u32) -> (u32, u32) {
        let chunk_idx = unit_idx >> 6; // divide by 64
        let bit_idx = unit_idx & 63;   // modulo 64
        (chunk_idx, bit_idx)
    }
}

/// Account context for creating an IP Block
#[derive(Accounts)]
#[instruction(tier: Tier, block_idx: u32)]
pub struct CreateIpBlock<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The root IP block for this tier
    #[account(
        mut,
        seeds = [b"root_ip_block", tier.to_seed().as_ref()],
        bump = root_ip_block.bump
    )]
    pub root_ip_block: Account<'info, RootIpBlock>,

    /// The IP block account to create
    #[account(
        init,
        payer = caller,
        space = IpBlock::calculate_size(tier),
        seeds = [
            b"ip_block",
            tier.to_seed().as_ref(),
            block_idx.to_le_bytes().as_ref(),
        ],
        bump
    )]
    pub ip_block: Account<'info, IpBlock>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Create a new IP Block for the specified tier and block index
    /// This is called on-demand by the allocator when needed
    pub fn create_ip_block(
        ctx: Context<CreateIpBlock>,
        tier: Tier,
        block_idx: u32,
    ) -> Result<()> {
        let root_ip_block = &mut ctx.accounts.root_ip_block;
        let ip_block = &mut ctx.accounts.ip_block;
        let bump = ctx.bumps.ip_block;

        // Validate tier matches
        require!(root_ip_block.tier == tier, DawnError::InvalidTier);

        // Calculate block base address
        let block_base = root_ip_block.base_ipv4 + (block_idx << (32 - BLOCK_PREFIX as u32));

        // Initialize the IP block
        ip_block.initialize(tier, block_base, bump)?;

        // Update root block tracking
        root_ip_block.mark_block_non_full(block_idx);
        // root_ip_block.increment_blocks_created();

        Ok(())
    }
}
