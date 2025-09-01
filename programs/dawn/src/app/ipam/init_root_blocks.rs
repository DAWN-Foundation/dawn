use crate::state::Config;
use crate::{app::DawnApp, DawnError, IpRegistry, IpTier, RootIpBlock, RootIpBlockInitialized, IpRegistryInitialized};
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

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Initialize a Root IP Block for the specified tier and sequence
    /// Can only be called by the DAWN authority
    pub fn initialize_root_ip_block(
        ctx: Context<InitializeRootIpBlock>,
        tier: IpTier,
        base_ipv4: u32,
        base_cidr: u8,
    ) -> Result<()> {
        let ip_registry = &mut ctx.accounts.ip_registry;
        let root_ip_block = &mut ctx.accounts.root_ip_block;
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

        // Validate sequence number
        let index = ip_registry.next_index;
        require!(index < tier.max_root_blocks(), DawnError::InvalidSequence);

        // Initialize the root IP block
        root_ip_block.initialize(tier, index, base_ipv4, base_cidr, ctx.bumps.root_ip_block)?;

        // Register the root block in the registry
        ip_registry.register_root_block().unwrap();

        // Emit initialization event
        emit!(RootIpBlockInitialized {
            root_ip_block: root_ip_block.key(),
            tier: tier.to_u8(),
            root_block_index: index,
            authority: caller.key(),
            base_ipv4,
            base_cidr,
            block_cidr: root_ip_block.block_cidr,
            created_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
