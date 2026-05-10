use anchor_lang::prelude::*;

use crate::{
    app::{lease_subscriber_ip_helper, DawnApp},
    state::{Config, Device, Plan},
    utils::hash_string_seed,
    DawnError, IpRegistry, IpTier, Subscription,
};

use crate::{IpBlock, IpLease, RootIpBlock};

/// Account context for leasing IP using strict-first allocation
#[derive(Accounts)]
pub struct LeaseSubscriberIpFor<'info> {
    // Schema migration: previously gated on `config.api_authority`.
    // The access-domain redesign drops that single global hot-key.
    // For lease-on-behalf, the natural authority is the Plan owner
    // (the operator who provisioned the plan the subscriber is on).
    #[account(mut, address = plan.owner)]
    pub caller: Signer<'info>,

    /// The beneficiary who will receive the subscription
    /// CHECK: Used only for PDA derivation and as subscriber
    pub beneficiary: AccountInfo<'info>,

    /// The config with fees and accounts
    #[account(
        seeds = [Config::SEED_PREFIX.as_ref()],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// Device account - optional for mobile subscribers without devices
    #[account(
        constraint = device.owner == beneficiary.key() @DawnError::InvalidDevice,
        seeds = [
            Device::SEED_PREFIX.as_ref(),
            device.owner.as_ref(),
            device.model.as_ref(),
            &hash_string_seed(&device.name),
            &device.mac_address,
        ],
        bump = device.bump
    )]
    pub device: Option<Account<'info, Device>>,

    /// The root block registry for this tier
    #[account(
        mut,
        seeds = [IpRegistry::SEED_PREFIX.as_ref(), IpTier::Subscriber.to_seed().as_ref()],
        bump = ip_registry.bump
    )]
    pub ip_registry: Account<'info, IpRegistry>,

    /// The root IP block for the specified tier
    #[account(
        mut,
        constraint = root_ip_block.tier == IpTier::Subscriber @ DawnError::InvalidTier,
        constraint = root_ip_block.has_free_blocks() @ DawnError::NoAvailableBlocks,
        constraint = root_ip_block.first_available_block_idx.is_some() @ DawnError::NoAvailableBlocks,
        constraint = ip_registry.find_available_root_block() == Some(root_ip_block.index) @ DawnError::InvalidRootIndex,
        seeds = [
            RootIpBlock::SEED_PREFIX.as_ref(),
            IpTier::Subscriber.to_seed().as_ref(),
            root_ip_block.index.to_le_bytes().as_ref()
        ],
        bump = root_ip_block.bump
    )]
    pub root_ip_block: Account<'info, RootIpBlock>,

    /// The IP block that will be used for allocation (may be created on-demand)
    #[account(
        init_if_needed,
        payer = caller,
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

    /// The IP lease account to create
    #[account(
        init,
        payer = caller,
        space = IpLease::SIZE,
        seeds = [
            IpLease::SEED_PREFIX.as_ref(),
            IpTier::Subscriber.to_seed().as_ref(),
            subscription.key().as_ref(),
        ],
        bump
    )]
    pub ip_lease: Account<'info, IpLease>,

    /// Subscription account to update
    #[account(
        mut,
        constraint = subscription.subscriber == beneficiary.key() @DawnError::InvalidBeneficiary,
        constraint = subscription.plan == plan.key() @DawnError::InvalidBeneficiary,
        seeds = [
            Subscription::SEED_PREFIX.as_ref(),
            subscription.plan.as_ref(),
            subscription.subscriber.as_ref(),
        ],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, Subscription>,

    /// The Plan the subscription belongs to. Caller must equal `plan.owner`.
    pub plan: Account<'info, Plan>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Lease IP using strict-first allocation algorithm
    /// Follows the IPAM bitmap specification for O(1) allocation
    pub fn lease_subscription_ip_for(ctx: Context<LeaseSubscriberIpFor>) -> Result<()> {
        lease_subscriber_ip_helper::process_lease_subscription_ip(
            &mut ctx.accounts.root_ip_block,
            &mut ctx.accounts.ip_block,
            &mut ctx.accounts.ip_lease,
            &ctx.accounts.device,
            &mut ctx.accounts.subscription,
            &mut ctx.accounts.ip_registry,
            ctx.bumps.ip_block,
            ctx.bumps.ip_lease,
        )
    }
}
