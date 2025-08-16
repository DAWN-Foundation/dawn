use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};

use std::cmp::min;
use crate::{
    constants::*,
    DawnApp, DawnError, IpLeased,
};

use super::{RootIpBlock, IpBlock, IpLease, IP_LEASE_SIZE};
use crate::{Device, Subscription};

/// Account context for leasing IP using strict-first allocation
#[derive(Accounts)]
pub struct LeaseSubscriberIp<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        constraint = device.owner == caller.key() && subscription.device.is_some() && subscription.device.unwrap() == device.key(),
        seeds = [
            b"device",
            device.owner.as_ref(),
            device.model.as_ref(),
            &device.name.as_bytes()[..min(device.name.len(), MAX_SEED_LEN)],
            &device.mac_address,
        ],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,

    /// The root IP block for the specified tier
    #[account(
        mut,
        seeds = [b"root_ip_block", Tier::Subscriber.to_seed().as_ref()],
        bump = root_ip_block.bump
    )]
    pub root_ip_block: Account<'info, RootIpBlock>,

    /// The IP block that will be used for allocation (may be created on-demand)
    #[account(
        init_if_needed,
        payer = caller,
        space = IpBlock::calculate_size(Tier::Subscriber),
        seeds = [
            b"ip_block",
            root_ip_block.first_available_block_idx().to_le_bytes().as_ref(),
        ],
        bump
    )]
    pub ip_block: Account<'info, IpBlock>,

    /// The IP lease account to create
    #[account(
        init,
        payer = caller,
        space = IP_LEASE_SIZE,
        seeds = [
            b"ip_lease",
            ip_block.first_available_ipv4().as_ref()
        ],
        bump
    )]
    pub ip_lease: Account<'info, IpLease>,

    /// Subscription account to update
    #[account(
        mut,
        seeds = [b"subscription", device.owner.as_ref()],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, Subscription>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Lease IP using strict-first allocation algorithm
    /// Follows the IPAM bitmap specification for O(1) allocation
    pub fn lease_subscription_ip(
        ctx: Context<LeaseSubscriberIp>,
    ) -> Result<()> {
        let root_ip_block = &mut ctx.accounts.root_ip_block;
        let ip_block = &mut ctx.accounts.ip_block;
        let ip_lease = &mut ctx.accounts.ip_lease;
        let device = &ctx.accounts.device;
        let subscription = &mut ctx.accounts.subscription;
        let subscriber_tier = Tier::Subscriber;

        let current_time = Clock::get()?.unix_timestamp;

        require!(subscription.expiration > current_time, DawnError::SubscriptionExpired);
        let lease_end = subscription.expiration;

        let block_idx = root_ip_block.first_available_block_idx();
        let block_base = root_ip_block.get_block_base_ipv4(block_idx);
        // if block is not initialized, initialize it
        if ip_block.block_base == 0 {
            ip_block.initialize(subscriber_tier, block_base, ctx.bumps.ip_block).unwrap();
            root_ip_block.mark_block_non_full(block_idx);
        }

        // mark as allocated and get the ipv4
        let (unit_idx, ipv4) = ip_block.allocate_first_available()?;

        // if we've allocated the last unit, mark the block as full
        if ip_block.is_full() {
            root_ip_block.mark_block_full(block_idx);
        }

        let cidr = subscriber_tier.unit_prefix();

        ip_lease.initialize(
            subscriber_tier,
            device.key(),
            ipv4,
            cidr,
            block_idx,
            unit_idx,
            lease_end,
            ctx.bumps.ip_lease,
        );

        // Emit allocation event
        emit!(IpLeased {
            ip_lease: ip_lease.key(),
            device: device.key(),
            tier: subscriber_tier.to_u8(),
            ipv4,
            cidr,
            lease_end,
            block_index: block_idx,
        });

        Ok(())
    }
}
