use anchor_lang::prelude::*;

use crate::{app::Config, DawnApp, DawnError, IpRegistry, IpReleased, Tier};

use super::{IpBlock, IpLease, RootIpBlock};

/// Account context for leasing IP using strict-first allocation
#[derive(Accounts)]
#[instruction(tier: Tier)]
pub struct ReleaseIp<'info> {
    #[account(mut, constraint = caller.key() == config.authority @ DawnError::Unauthorized)]
    pub caller: Signer<'info>,

    /// The config account to validate authority
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// The root block registry for this tier
    #[account(
        mut,
        seeds = [
            b"ip_registry", 
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
            b"root_ip_block", 
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
            b"ip_block",
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
        // constraint = ip_lease.is_expired() @ DawnError::IpLeaseNotExpired,
        seeds = [
            b"ip_lease",
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
    pub fn release_ip(ctx: Context<ReleaseIp>, _tier: Tier) -> Result<()> {
        let root_ip_block = &mut ctx.accounts.root_ip_block;
        let ip_block = &mut ctx.accounts.ip_block;
        let ip_lease = &mut ctx.accounts.ip_lease;

        ip_block.release(ip_lease.unit_index)?;

        // if block was full before, mark it as not full
        if root_ip_block.is_block_full(ip_lease.block_index) {
            root_ip_block.mark_block_non_full(ip_lease.block_index);
        }

        // Emit release event
        emit!(IpReleased {
            ip_lease: ip_lease.key(),
            device: ip_lease.device,
            ipv4: ip_lease.ipv4,
            block_index: ip_lease.block_index,
        });

        Ok(())
    }
}
