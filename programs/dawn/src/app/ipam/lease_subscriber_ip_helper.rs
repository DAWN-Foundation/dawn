use anchor_lang::prelude::*;

use crate::{
    error::DawnError,
    events::{IpBlockAdded, IpBlockFull, IpLeased, RootIpBlockFull},
    state::{Device, IpBlock, IpLease, IpRegistry, IpTier, RootIpBlock, Subscription},
};

pub fn process_lease_subscription_ip(
    root_ip_block: &mut Account<RootIpBlock>,
    ip_block: &mut Account<IpBlock>,
    ip_lease: &mut Account<IpLease>,
    device: &Option<Account<Device>>,
    subscription: &mut Account<Subscription>,
    ip_registry: &mut Account<IpRegistry>,
    ip_block_bump: u8,
    ip_lease_bump: u8,
) -> Result<()> {
    // Get device key if device is provided
    let device_key = device.as_ref().map(|d| d.key());

    let subscriber_tier = IpTier::Subscriber;

    // When device is None, subscription.device must be None
    // When device is Some, subscription.device must match the device key
    match (device_key, subscription.device) {
        (None, None) => {} // OK: no device provided, subscription has no device
        (Some(dev_key), Some(sub_dev)) if dev_key == sub_dev => {}
        _ => return Err(DawnError::InvalidDevice.into()),
    }

    let root_block_index = ip_registry
        .find_available_root_block()
        .ok_or(DawnError::NoAvailableBlocks)?;

    let current_time = Clock::get()?.unix_timestamp;

    require!(
        subscription.expiration > current_time,
        DawnError::SubscriptionExpired
    );

    let block_idx = root_ip_block
        .first_available_block_idx
        .ok_or(DawnError::NoAvailableBlocks)?;

    let block_base = root_ip_block.get_block_base_ipv4_checked(block_idx)?;
    // if block is not initialized, initialize it (use created_at as robust init flag)
    if ip_block.created_at == 0 {
        ip_block.initialize(subscriber_tier, root_block_index, block_base, ip_block_bump)?;
        emit!(IpBlockAdded {
            ip_block: ip_block.key(),
            tier: subscriber_tier.to_u8(),
            root_block_index: root_block_index,
            block_base: block_base,
            block_cidr: ip_block.block_cidr,
            unit_capacity: ip_block.unit_capacity,
            free_units: ip_block.free_units,
            created_at: current_time,
        });
    }

    // // mark as allocated and get the ipv4
    let (unit_idx, ipv4) = ip_block.allocate_first_available()?;

    // // if we've allocated the last unit, mark the block as full
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

    let cidr = subscriber_tier.unit_prefix();

    ip_lease.initialize(
        subscriber_tier,
        subscription.key(), // seed_key for PDA derivation
        device_key,
        ipv4,
        cidr,
        block_idx,
        unit_idx,
        ip_lease_bump,
    )?;

    // Emit allocation event
    emit!(IpLeased {
        ip_lease: ip_lease.key(),
        subscription: Some(subscription.key()),
        device: device_key,
        tier: subscriber_tier.to_u8(),
        ipv4,
        cidr,
        unit_index: unit_idx,
        block_index: block_idx,
        leased_at: current_time,
    });

    Ok(())
}
