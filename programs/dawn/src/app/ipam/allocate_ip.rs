use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use crate::{
    events::{IpBlockAdded, IpBlockFull, IpLeased, RootIpBlockFull},
    state::{Device, IpBlock, IpLease, IpRegistry, IpTier, RootIpBlock},
    DawnApp, DawnError,
};

#[derive(Accounts)]
#[instruction(tier: IpTier)]
pub struct AllocateIp<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [
            Device::SEED_PREFIX.as_ref(),
            device.owner.as_ref(),
            device.model.as_ref(),
            &device.name.as_bytes()[..min(device.name.len(), MAX_SEED_LEN)],
            &device.mac_address,
        ],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,

    /// The root block registry for this tier
    #[account(
        mut,
        seeds = [IpRegistry::SEED_PREFIX.as_ref(), tier.to_seed().as_ref()],
        bump = ip_registry.bump
    )]
    pub ip_registry: Account<'info, IpRegistry>,

    #[account(
        mut,
        constraint = root_ip_block.authority == authority.key() @ DawnError::Unauthorized,
        constraint = root_ip_block.has_free_blocks() @ DawnError::NoAvailableBlocks,
        constraint = root_ip_block.first_available_block_idx.is_some() @ DawnError::NoAvailableBlocks,
        seeds = [
            RootIpBlock::SEED_PREFIX.as_ref(),
            tier.to_seed().as_ref(),
            root_ip_block.index.to_le_bytes().as_ref(),
        ],
        bump = root_ip_block.bump
    )]
    pub root_ip_block: Account<'info, RootIpBlock>,

    #[account(
        init_if_needed,
        payer = authority,
        space = IpBlock::SIZE,
        seeds = [
            IpBlock::SEED_PREFIX.as_ref(),
            root_ip_block.key().as_ref(),
            // Use unwrap_or(0) to prevent panic; actual validation done by constraints
            root_ip_block.first_available_block_idx.unwrap_or(0).to_le_bytes().as_ref(),
        ],
        bump
    )]
    pub ip_block: Account<'info, IpBlock>,

    #[account(
        init,
        payer = authority,
        space = IpLease::SIZE,
        seeds = [
            IpLease::SEED_PREFIX.as_ref(),
            tier.to_seed().as_ref(),
            device.key().as_ref(),
        ],
        bump
    )]
    pub ip_lease: Account<'info, IpLease>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn allocate_ip(ctx: Context<AllocateIp>, tier: IpTier) -> Result<()> {
        require!(
            tier == IpTier::Loopback || tier == IpTier::PtP,
            DawnError::InvalidTier
        );

        let device = &mut ctx.accounts.device;
        let ip_registry = &mut ctx.accounts.ip_registry;
        let root_ip_block = &mut ctx.accounts.root_ip_block;
        let ip_block = &mut ctx.accounts.ip_block;
        let ip_lease = &mut ctx.accounts.ip_lease;

        let block_idx = root_ip_block
            .first_available_block_idx
            .ok_or(DawnError::NoAvailableBlocks)?;

        let block_base = root_ip_block.get_block_base_ipv4_checked(block_idx)?;
        let root_block_index = root_ip_block.index;
        let current_time = Clock::get()?.unix_timestamp;

        // If block is not initialized, initialize it
        if ip_block.block_base == 0 {
            ip_block.initialize(tier, root_block_index, block_base, ctx.bumps.ip_block)?;
            emit!(IpBlockAdded {
                ip_block: ip_block.key(),
                tier: tier.to_u8(),
                root_block_index: root_block_index,
                block_base: block_base,
                block_cidr: ip_block.block_cidr,
                unit_capacity: ip_block.unit_capacity,
                free_units: ip_block.free_units,
                created_at: current_time,
            });
        }

        // Mark as allocated and get the ipv4
        let (unit_idx, ipv4) = ip_block.allocate_first_available()?;

        // If we've allocated the last unit, mark the block as full
        if ip_block.is_full() {
            root_ip_block.mark_block_full(block_idx);
            emit!(IpBlockFull {
                ip_block: ip_block.key(),
                timestamp: current_time,
            });
        }

        if !root_ip_block.has_free_blocks() {
            ip_registry.update_root_availability(root_block_index, false);
            emit!(RootIpBlockFull {
                root_ip_block: root_ip_block.key(),
                timestamp: current_time,
            });
        }

        // Initialize the IP lease
        ip_lease.initialize(
            tier,
            device.key(),
            ipv4,
            tier.unit_prefix(),
            block_idx,
            unit_idx,
            ctx.bumps.ip_lease,
        );

        // Emit IP lease event
        emit!(IpLeased {
            ip_lease: ip_lease.key(),
            device: device.key(),
            tier: tier.to_u8(),
            ipv4,
            cidr: tier.unit_prefix(),
            unit_index: unit_idx,
            block_index: block_idx,
            leased_at: current_time,
        });

        Ok(())
    }
}
