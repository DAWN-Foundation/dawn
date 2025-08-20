use crate::{app::Config, DawnApp, DawnError, RootIpBlock, RootIpBlockInitialized, Tier};
use anchor_lang::prelude::*;

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
    pub fn initialize_root_ip_block(ctx: Context<InitializeRootIpBlock>, tier: Tier) -> Result<()> {
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
    pub fn initialize_all_root_ip_blocks(ctx: Context<InitializeAllRootIpBlocks>) -> Result<()> {
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
