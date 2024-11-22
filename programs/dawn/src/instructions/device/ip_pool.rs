use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};

use crate::{Config, DawnApp, DawnError, IpPoolAdded};

/// IP address pool owned by an authority
#[account]
pub struct IpPool {
    /// Starting IP address of range
    pub range_start: [u8; 4],
    /// Ending IP address of range
    pub range_end: [u8; 4],
    /// PDA bump seed
    pub bump: u8,
}

const IP_POOL_SIZE: usize = 8 // id
    + 4 // range start
    + 4 // range end
    + 1; // bump

#[derive(Accounts)]
#[instruction(range_start: [u8; 4], range_end: [u8; 4])]
pub struct AddIpPool<'info> {
    #[account(mut, constraint = caller.key() == config.authority )]
    pub caller: Signer<'info>,

    /// The config account
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    /// The ip pool account
    #[account(
        init,
        payer = caller,
        space = IP_POOL_SIZE,
        seeds = [
            b"ip_pool",
            &range_start[..],
            &range_end[..],
        ],
        bump
    )]
    pub ip_pool: Account<'info, IpPool>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn add_ip_pool(
        ctx: Context<AddIpPool>,
        range_start: [u8; 4],
        range_end: [u8; 4],
    ) -> Result<()> {
        let ip_pool = &mut ctx.accounts.ip_pool;

        // Make sure the range start and end are not empty
        require!(
            !range_start.iter().all(|&b| b == 0),
            DawnError::InvalidIpPoolRange
        );
        require!(
            !range_end.iter().all(|&b| b == 0),
            DawnError::InvalidIpPoolRange
        );

        ip_pool.range_start = range_start;
        ip_pool.range_end = range_end;
        ip_pool.bump = ctx.bumps.ip_pool;

        emit!(IpPoolAdded {
            ip_pool: ip_pool.key(),
            range_start: range_start,
            range_end: range_end,
        });

        Ok(())
    }
}
