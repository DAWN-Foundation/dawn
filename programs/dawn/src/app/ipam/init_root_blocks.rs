use crate::state::Config;
use crate::{
    app::DawnApp, DawnError, IpRegistry, IpRegistryInitialized, IpTier, RootIpBlock,
    RootIpBlockInitialized,
};
use anchor_lang::prelude::*;

/// Account context for initializing a Root IP Block with sequence (authority required)
#[derive(Accounts)]
#[instruction(tier: IpTier)]
pub struct InitializeRootIpBlock<'info> {
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
        init_if_needed,
        payer = caller,
        space = IpRegistry::SIZE,
        seeds = [IpRegistry::SEED_PREFIX.as_ref(), tier.to_seed().as_ref()],
        bump
    )]
    pub ip_registry: Account<'info, IpRegistry>,

    /// The root IP block account for the specified tier and sequence
    #[account(
        init,
        payer = caller,
        space = RootIpBlock::SIZE,
        seeds = [
            RootIpBlock::SEED_PREFIX.as_ref(),
            tier.to_seed().as_ref(),
            ip_registry.next_index.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub root_ip_block: Account<'info, RootIpBlock>,

    /// CHECK: Root IP Block authority
    #[account()]
    pub authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Initialize a Root IP Block with flexible configuration
    /// Can only be called by the DAWN authority
    ///
    /// Parameters:
    /// - tier: Categorization (Subscriber, Loopback, PtP) - also determines unit_prefix
    /// - base_ipv4: Starting IPv4 address for this root block
    /// - base_cidr: CIDR prefix for the entire root block range
    pub fn initialize_root_ip_block(
        ctx: Context<InitializeRootIpBlock>,
        tier: IpTier,
        base_ipv4: u32,
        base_cidr: u8,
    ) -> Result<()> {
        let ip_registry = &mut ctx.accounts.ip_registry;
        let root_ip_block = &mut ctx.accounts.root_ip_block;
        let authority = &ctx.accounts.authority;
        let caller = &ctx.accounts.caller;

        if ip_registry.bump == 0 {
            ip_registry.initialize(tier, caller.key(), ctx.bumps.ip_registry)?;
            emit!(IpRegistryInitialized {
                ip_registry: ip_registry.key(),
                tier: tier.to_u8(),
                authority: caller.key(),
                created_at: Clock::get()?.unix_timestamp,
            });
        }

        // Validate configuration parameters
        require!(base_cidr <= 32, DawnError::InvalidCidr);

        // Validate sequence number
        let index = ip_registry.next_index;
        require!(index < 256, DawnError::InvalidSequence); // Max 256 root blocks per tier

        // Validate base_ipv4 won't cause overflow during IP allocation
        Self::validate_root_block_config(base_ipv4, base_cidr)?;

        // Initialize the root IP block
        root_ip_block.initialize(
            tier,
            authority.key(),
            index,
            base_ipv4,
            base_cidr,
            ctx.bumps.root_ip_block,
        )?;

        // Register the root block in the registry
        ip_registry.register_root_block().unwrap();

        // Emit initialization event
        emit!(RootIpBlockInitialized {
            root_ip_block: root_ip_block.key(),
            tier: tier.to_u8(),
            root_block_index: index,
            authority: authority.key(),
            base_ipv4,
            base_cidr,
            block_cidr: root_ip_block.block_cidr,
            created_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Validate root block configuration to prevent overflow
    fn validate_root_block_config(base_ipv4: u32, base_cidr: u8) -> Result<()> {
        // Calculate the network size for this CIDR
        let network_size = if base_cidr < 32 {
            1u64 << (32 - base_cidr)
        } else {
            1u64
        };

        // Ensure base_ipv4 is aligned to the network boundary
        if base_cidr < 32 {
            let alignment = 1u32 << (32 - base_cidr);
            let mask = !(alignment - 1);

            require!(base_ipv4 == (base_ipv4 & mask), DawnError::IPv4NotAligned);
        }

        // Verify that base_ipv4 + network_size won't overflow
        let base_u64 = base_ipv4 as u64;
        let max_ipv4 = base_u64
            .checked_add(network_size)
            .ok_or(DawnError::IPv4Overflow)?;

        require!(
            max_ipv4 <= (u32::MAX as u64) + 1,
            DawnError::IPv4RangeExceedsMax
        );

        Ok(())
    }
}
