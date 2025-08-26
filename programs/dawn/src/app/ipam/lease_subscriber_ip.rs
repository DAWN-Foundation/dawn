use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};

use crate::{DawnApp, DawnError, Device, IpLeased, IpRegistry, Subscription, Tier};
use std::cmp::min;

use super::{IpBlock, IpLease, RootIpBlock, IP_LEASE_SIZE};

/// Account context for leasing IP using strict-first allocation
#[derive(Accounts)]
pub struct LeaseSubscriberIp<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        constraint = device.owner == caller.key() @DawnError::InvalidDevice,
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

    /// The root block registry for this tier
    #[account(
        mut,
        seeds = [b"ip_registry", Tier::Subscriber.to_seed().as_ref()],
        bump = ip_registry.bump
    )]
    pub ip_registry: Account<'info, IpRegistry>,

    /// The root IP block for the specified tier
    #[account(
        mut,
        seeds = [
            b"root_ip_block", 
            Tier::Subscriber.to_seed().as_ref(),
            ip_registry.find_available_root_block().unwrap().to_le_bytes().as_ref()
        ],
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
            root_ip_block.key().as_ref(),
            root_ip_block.first_available_block_idx().unwrap().to_le_bytes().as_ref(),
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
            Tier::Subscriber.to_seed().as_ref(),
            device.key().as_ref(),
        ],
        bump
    )]
    pub ip_lease: Account<'info, IpLease>,

    /// Subscription account to update
    #[account(
        mut,
        constraint = subscription.device.is_some() && subscription.device.unwrap() == device.key() @DawnError::InvalidDevice,
        seeds = [
            b"subscription", 
            subscription.plan.as_ref(),
            subscription.subscriber.as_ref(),
        ],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, Subscription>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Lease IP using strict-first allocation algorithm
    /// Follows the IPAM bitmap specification for O(1) allocation
    pub fn lease_subscription_ip(ctx: Context<LeaseSubscriberIp>) -> Result<()> {
        let root_ip_block = &mut ctx.accounts.root_ip_block;
        let ip_block = &mut ctx.accounts.ip_block;
        let ip_lease = &mut ctx.accounts.ip_lease;
        let device = &ctx.accounts.device;
        let subscription = &mut ctx.accounts.subscription;
        let subscriber_tier = Tier::Subscriber;
        let ip_registry = &mut ctx.accounts.ip_registry;
        let root_block_index = ip_registry.find_available_root_block().unwrap();

        let current_time = Clock::get()?.unix_timestamp;

        require!(
            subscription.expiration > current_time,
            DawnError::SubscriptionExpired
        );
        // let lease_end = subscription.expiration;

        let block_idx = root_ip_block
            .first_available_block_idx()
            .ok_or(DawnError::NoAvailableBlocks)?;
        let block_base = root_ip_block.get_block_base_ipv4(block_idx);
        // if block is not initialized, initialize it
        if ip_block.block_base == 0 {
            ip_block
                .initialize(
                    subscriber_tier,
                    root_block_index,
                    block_base,
                    ctx.bumps.ip_block,
                )
                .unwrap();
        }

        // // mark as allocated and get the ipv4
        let (unit_idx, ipv4) = ip_block.allocate_first_available()?;

        // // if we've allocated the last unit, mark the block as full
        if ip_block.is_full() {
            root_ip_block.mark_block_full(block_idx);
        }

        if !root_ip_block.has_free_blocks() {
            ip_registry.update_root_availability(root_block_index, false);
        }

        let cidr = subscriber_tier.unit_prefix();

        ip_lease.initialize(
            subscriber_tier,
            device.key(),
            ipv4,
            cidr,
            block_idx,
            unit_idx,
            // lease_end,
            ctx.bumps.ip_lease,
        );

        // Emit allocation event
        emit!(IpLeased {
            ip_lease: ip_lease.key(),
            device: device.key(),
            tier: subscriber_tier.to_u8(),
            ipv4,
            cidr,
            // lease_end,
            unit_index: unit_idx,
            block_index: block_idx,
        });

        Ok(())
    }
}
