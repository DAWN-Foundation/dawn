use anchor_lang::prelude::*;

use crate::{
    app::DawnApp,
    error::DawnError,
    events::{IpBlockNonFull, IpRevoked, RootIpBlockNonFull},
    state::{Config, IpRegistry, IpTier},
};

use crate::{IpBlock, IpLease, RootIpBlock};

/// Account context for leasing IP using strict-first allocation
#[derive(Accounts)]
#[instruction(tier: IpTier)]
pub struct RevokeIp<'info> {
    #[account(mut, constraint = caller.key() == config.authority @ DawnError::Unauthorized)]
    pub caller: Signer<'info>,

    /// The config account to validate authority
    #[account(
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// The root block registry for this tier
    #[account(
        mut,
        seeds = [
            IpRegistry::SEED_PREFIX.as_ref(),
            tier.to_seed().as_ref()
            ],
        bump = ip_registry.bump
    )]
    pub ip_registry: Account<'info, IpRegistry>,

    /// The root IP block for the specified tier
    #[account(
        mut,
        constraint = config.authority == caller.key() @ DawnError::Unauthorized,
        seeds = [
            RootIpBlock::SEED_PREFIX.as_ref(),
            tier.to_seed().as_ref(),
            ip_block.root_block_index.to_le_bytes().as_ref()
        ],
        bump = root_ip_block.bump
    )]
    pub root_ip_block: Account<'info, RootIpBlock>,

    /// The IP block that will be used for allocation (may be created on-demand)
    #[account(
        mut,
        seeds = [
            IpBlock::SEED_PREFIX.as_ref(),
            root_ip_block.key().as_ref(),
            ip_lease.block_index.to_le_bytes().as_ref(),
        ],
        bump = ip_block.bump
    )]
    pub ip_block: Account<'info, IpBlock>,

    /// The IP lease account to create
    #[account(
        mut,
        close = caller,
        seeds = [
            IpLease::SEED_PREFIX.as_ref(),
            tier.to_seed().as_ref(),
            ip_lease.device.as_ref(),
        ],
        bump = ip_lease.bump
    )]
    pub ip_lease: Account<'info, IpLease>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Release IP lease
    pub fn revoke_ip(ctx: Context<RevokeIp>, _tier: IpTier) -> Result<()> {
        let ip_registry = &mut ctx.accounts.ip_registry;
        let root_ip_block = &mut ctx.accounts.root_ip_block;
        let ip_block = &mut ctx.accounts.ip_block;
        let ip_lease = &mut ctx.accounts.ip_lease;
        let current_time = Clock::get()?.unix_timestamp;

        ip_block.release(ip_lease.unit_index)?;

        // if block was full before, mark it as not full
        if root_ip_block.is_block_full(ip_lease.block_index) {
            root_ip_block.mark_block_non_full(ip_lease.block_index);
            emit!(IpBlockNonFull {
                ip_block: ip_block.key(),
                timestamp: current_time,
            });
        }

        if !root_ip_block.has_free_blocks() {
            // Use root_ip_block.index (0-255) not ip_lease.block_index (0-4095)
            ip_registry.update_root_availability(root_ip_block.index, true);
            emit!(RootIpBlockNonFull {
                root_ip_block: root_ip_block.key(),
                timestamp: current_time,
            });
        }

        // Emit release event
        emit!(IpRevoked {
            ip_lease: ip_lease.key(),
            device: ip_lease.device,
            ipv4: ip_lease.ipv4,
            block_index: ip_lease.block_index,
            revoked_at: current_time,
        });

        Ok(())
    }
}
