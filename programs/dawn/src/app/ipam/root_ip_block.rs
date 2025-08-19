use anchor_lang::prelude::*;
use crate::{
    constants::*,
    app::Config,
    DawnApp, DawnError, RootIpBlockInitialized,
    Tier,
};

/// Root IP Block that tracks fixed-size IP Blocks for a specific tier
/// Maintains global free summary and high-water mark for on-demand creation
#[account]
pub struct RootIpBlock {
    /// Tier identifier (Subscriber, Loopback, PtP)
    pub tier: Tier,
    /// Base IPv4 address for this tier
    pub base_ipv4: u32,
    /// Base prefix length (/10, /11, /11)
    pub base_prefix: u8,
    /// Block prefix length (/22 - 1024 /32 or 512 /31 per IP Block)
    pub block_prefix: u8,
    // /// Total possible blocks for this tier
    // pub blocks_total: u16,
    // /// Number of contiguous blocks created (0..blocks_created-1 exist)
    // pub blocks_created: u16,
    /// Bitmap chunks - 1 bit per IP Block (1 = has free unit)
    /// Subscriber: 4096 blocks / 64 = 64 chunks
    /// Loopback/PtP: 2048 blocks / 64 = 32 chunks
    pub root_chunks: Vec<u64>,
    /// Summary bitmap - 1 bit per root chunk (1 = that chunk != 0)
    pub root_summary64: u64,
    /// PDA bump seed
    pub bump: u8,
}

impl RootIpBlock {
    /// Calculate account size for a specific tier
    pub fn calculate_size(tier: Tier) -> usize {
        let chunk_count = tier.root_chunks_count();
        
        8 // discriminator
            + 1 // tier (stored as u8)
            + 4 // base_ipv4
            + 1 // base_prefix
            + 1 // block_prefix
            // + 2 // blocks_total
            // + 2 // blocks_created
            + 4 + (chunk_count * 8) // root_chunks Vec<u64>
            + 8 // root_summary64
            + 1 // bump
    }

    /// Initialize a new RootIpBlock for the given tier
    pub fn initialize(&mut self, tier: Tier, bump: u8) -> Result<()> {
        self.tier = tier;
        self.base_ipv4 = tier.base_ipv4();
        self.base_prefix = tier.base_prefix();
        self.block_prefix = BLOCK_PREFIX;
        // self.blocks_total = tier.max_blocks();
        // self.blocks_created = 0;
        self.root_chunks = vec![0u64; tier.root_chunks_count()];
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

    pub fn find_block_idx_by_ipv4(&self, ipv4: [u8; 4]) -> Option<u32> {
        let ipv4 = u32::from_be_bytes(ipv4);
        let unit_idx = self.ipv4_to_unit(ipv4).unwrap();
        self.find_block_idx_by_unit_idx(unit_idx)
    }

    pub fn ipv4_to_unit(&self, ipv4: u32) -> Option<u32> {
        let unit_idx = ipv4 >> (32 - self.block_prefix as u32);
        Some(unit_idx)
    }

    pub fn find_block_idx_by_unit_idx(&self, unit_idx: u32) -> Option<u32> {
        let j = (unit_idx >> 6) as u32; // chunk index
        let k = (unit_idx & 63) as u32; // bit within chunk

        if j < self.root_chunks.len() as u32 {
            Some(j << 6 | k)
        } else {
            None
        }
    }

    pub fn get_block_base_ipv4(&self, block_idx: u32) -> u32 {
        self.base_ipv4 + (block_idx << (32 - self.block_prefix as u32))
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
}

/// Account context for initializing a Root IP Block (authority required)
#[derive(Accounts)]
#[instruction(tier: Tier)]
pub struct InitializeRootIpBlock<'info> {
    #[account(mut, constraint = caller.key() == config.authority @ DawnError::Unauthorized)]
    pub caller: Signer<'info>,

    /// The config account to validate authority
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// The root IP block account for the specified tier
    #[account(
        init,
        payer = caller,
        space = RootIpBlock::calculate_size(tier),
        seeds = [b"root_ip_block", tier.to_seed().as_ref()],
        bump
    )]
    pub root_ip_block: Account<'info, RootIpBlock>,

    pub system_program: Program<'info, System>,
}

/// Account context for batch initializing all root IP blocks
#[derive(Accounts)]
pub struct InitializeAllRootIpBlocks<'info> {
    #[account(mut, constraint = caller.key() == config.authority @ DawnError::Unauthorized)]
    pub caller: Signer<'info>,

    /// The config account to validate authority
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// Subscriber tier root IP block
    #[account(
        init,
        payer = caller,
        space = RootIpBlock::calculate_size(Tier::Subscriber),
        seeds = [b"root_ip_block", Tier::Subscriber.to_seed().as_ref()],
        bump
    )]
    pub subscriber_root: Account<'info, RootIpBlock>,

    /// Loopback tier root IP block
    #[account(
        init,
        payer = caller,
        space = RootIpBlock::calculate_size(Tier::Loopback),
        seeds = [b"root_ip_block", Tier::Loopback.to_seed().as_ref()],
        bump
    )]
    pub loopback_root: Account<'info, RootIpBlock>,

    /// PtP tier root IP block
    #[account(
        init,
        payer = caller,
        space = RootIpBlock::calculate_size(Tier::PtP),
        seeds = [b"root_ip_block", Tier::PtP.to_seed().as_ref()],
        bump
    )]
    pub ptp_root: Account<'info, RootIpBlock>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Initialize a Root IP Block for the specified tier
    /// Can only be called by the DAWN authority
    pub fn initialize_root_ip_block(
        ctx: Context<InitializeRootIpBlock>,
        tier: Tier,
    ) -> Result<()> {
        let root_ip_block = &mut ctx.accounts.root_ip_block;
        let bump = ctx.bumps.root_ip_block;

        root_ip_block.initialize(tier, bump)?;

        // Emit initialization event
        emit!(RootIpBlockInitialized {
            root_ip_block: root_ip_block.key(),
            tier: tier.to_u8(),
            base_ipv4: root_ip_block.base_ipv4,
            base_prefix: root_ip_block.base_prefix,
            // blocks_total: root_ip_block.blocks_total,
            created_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Initialize all Root IP Blocks for all tiers at once
    /// Can only be called by the DAWN authority
    pub fn initialize_all_root_ip_blocks(
        ctx: Context<InitializeAllRootIpBlocks>,
    ) -> Result<()> {
        let current_time = Clock::get()?.unix_timestamp;

        // Initialize Subscriber tier
        let subscriber_root = &mut ctx.accounts.subscriber_root;
        let subscriber_bump = ctx.bumps.subscriber_root;
        subscriber_root.initialize(Tier::Subscriber, subscriber_bump)?;

        emit!(RootIpBlockInitialized {
            root_ip_block: subscriber_root.key(),
            tier: Tier::Subscriber.to_u8(),
            base_ipv4: subscriber_root.base_ipv4,
            base_prefix: subscriber_root.base_prefix,
            // blocks_total: subscriber_root.blocks_total,
            created_at: current_time,
        });

        // Initialize Loopback tier
        let loopback_root = &mut ctx.accounts.loopback_root;
        let loopback_bump = ctx.bumps.loopback_root;
        loopback_root.initialize(Tier::Loopback, loopback_bump)?;

        emit!(RootIpBlockInitialized {
            root_ip_block: loopback_root.key(),
            tier: Tier::Loopback.to_u8(),
            base_ipv4: loopback_root.base_ipv4,
            base_prefix: loopback_root.base_prefix,
            // blocks_total: loopback_root.blocks_total,
            created_at: current_time,
        });

        // Initialize PtP tier
        let ptp_root = &mut ctx.accounts.ptp_root;
        let ptp_bump = ctx.bumps.ptp_root;
        ptp_root.initialize(Tier::PtP, ptp_bump)?;

        emit!(RootIpBlockInitialized {
            root_ip_block: ptp_root.key(),
            tier: Tier::PtP.to_u8(),
            base_ipv4: ptp_root.base_ipv4,
            base_prefix: ptp_root.base_prefix,
            // blocks_total: ptp_root.blocks_total,
            created_at: current_time,
        });

        Ok(())
    }
}
