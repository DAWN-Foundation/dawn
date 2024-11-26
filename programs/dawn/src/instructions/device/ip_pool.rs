use anchor_lang::prelude::*;

use crate::{Config, DawnApp, DawnError, IpLeased, IpPoolAdded};

use super::Device;

/// IP address pool owned by an authority
#[account]
pub struct IpPool {
    /// IP V4 address of range
    pub ip_v4: [u8; 4],
    /// The CIDR mask for the IP V4 range
    pub ip_v4_cidr_mask: u8,
    /// IP V6 address of range
    pub ip_v6: [u16; 16],
    /// The CIDR mask for the IP V6 range
    pub ip_v6_cidr_mask: u8,
    /// PDA bump seed
    pub bump: u8,
}

const IP_POOL_SIZE: usize = 8 // id
    + 4 // ip v4
    + 1 // ip v4 cidr mask
    + 32 // ip v6
    + 1 // ip v6 cidr mask
    + 1; // bump

/// Individual IP lease assignment
#[account]
pub struct IpLease {
    /// Reference to the belonging IP Pool
    pub ip_pool: Pubkey,
    /// Device this IP is leased to
    pub device: Pubkey,
    /// Base IPv4 address (e.g., 192.168.1.0)
    pub ip_v4: [u8; 4],
    /// Subnet mask in CIDR notation (e.g., 24 means /24 or 255.255.255.0)
    pub ip_v4_cidr_mask: u8,
    /// Base IPv6 address
    pub ip_v6: [u16; 16],
    /// IPv6 subnet mask in CIDR notation (e.g., 64 for /64)
    pub ip_v6_cidr_mask: u8,
    /// PDA bump seed
    pub bump: u8,
}

const IP_LEASE_SIZE: usize = 8 // id
    + 32 // ip pool
    + 32 // device
    + 4  // ip v4
    + 1  // ip v4 cidr mask
    + 32 // ip v6
    + 1  // ip v6 cidr mask
    + 1; // bump

#[derive(Accounts)]
#[instruction(ip_v4: [u8; 4], ip_v4_cidr_mask: u8, ip_v6: [u16; 16], ip_v6_cidr_mask: u8)]
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
            &ip_v4[..],
            &[ip_v4_cidr_mask],
            &ip_v6.iter().flat_map(|x| x.to_le_bytes()).collect::<Vec<u8>>(),
            &[ip_v6_cidr_mask],
        ],
        bump
    )]
    pub ip_pool: Account<'info, IpPool>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(ip_v4: [u8; 4], ip_v4_cidr_mask: u8, ip_v6: [u16; 16], ip_v6_cidr_mask: u8)]
pub struct LeaseIp<'info> {
    #[account(mut, constraint = caller.key() == config.authority)]
    pub caller: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [
            b"device",
            &device.owner.as_ref(),
            &device.model.as_ref(),
        ],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,

    #[account(
        mut,
        seeds = [
            b"ip_pool",
            &ip_pool.ip_v4.iter().flat_map(|x| x.to_le_bytes()).collect::<Vec<u8>>(),
            &[ip_pool.ip_v4_cidr_mask],
            &ip_pool.ip_v6.iter().flat_map(|&x| x.to_le_bytes()).collect::<Vec<u8>>(),
            &[ip_pool.ip_v6_cidr_mask],
        ],
        bump = ip_pool.bump
    )]
    pub ip_pool: Account<'info, IpPool>,

    #[account(
        init,
        payer = caller,
        space = IP_LEASE_SIZE,
        seeds = [
            b"ip_lease",
            device.key().as_ref(),
            ip_pool.key().as_ref(),
            &ip_v4[..],
            &[ip_v4_cidr_mask],
            &ip_v6.iter().flat_map(|&x| x.to_le_bytes()).collect::<Vec<u8>>(),
            &[ip_v6_cidr_mask],
        ],
        bump
    )]
    pub ip_lease: Account<'info, IpLease>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    /// Add an IP Pool containing a range of IP addresses
    /// Can only be called by the DAWN authority
    pub fn add_ip_pool(
        ctx: Context<AddIpPool>,
        ip_v4: [u8; 4],
        ip_v4_cidr_mask: u8,
        ip_v6: [u16; 16],
        ip_v6_cidr_mask: u8,
    ) -> Result<()> {
        msg!("ip_v4: {:?}", ip_v4);
        msg!("ip_v4_cidr_mask: {:?}", ip_v4_cidr_mask);
        msg!("ip_v6: {:?}", ip_v6);
        msg!("ip_v6_cidr_mask: {:?}", ip_v6_cidr_mask);

        // Make sure the IP V4 and V6 addresses are not zero
        require!(!ip_v4.iter().all(|&b| b == 0), DawnError::InvalidIpRange);
        require!(!ip_v6.iter().all(|&b| b == 0), DawnError::InvalidIpRange);

        // Make sure the IP V4 and V6 addresses are not 255.255.255.255 or ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
        require!(!ip_v4.iter().all(|&b| b == 255), DawnError::InvalidIpRange);
        require!(
            !ip_v6.iter().all(|&b| b == 0xffff),
            DawnError::InvalidIpRange
        );

        // Make sure the IP V4 and V6 subnet masks are valid
        require!(
            ip_v4_cidr_mask >= 8 && ip_v4_cidr_mask <= 32,
            DawnError::InvalidSubnetMask
        );
        require!(
            ip_v6_cidr_mask >= 8 && ip_v6_cidr_mask <= 128,
            DawnError::InvalidSubnetMask
        );

        let ip_pool = &mut ctx.accounts.ip_pool;

        ip_pool.ip_v4 = ip_v4;
        ip_pool.ip_v4_cidr_mask = ip_v4_cidr_mask;
        ip_pool.ip_v6 = ip_v6;
        ip_pool.ip_v6_cidr_mask = ip_v6_cidr_mask;
        ip_pool.bump = ctx.bumps.ip_pool;

        emit!(IpPoolAdded {
            ip_pool: ip_pool.key(),
            ip_v4: ip_pool.ip_v4,
            ip_v4_cidr_mask: ip_pool.ip_v4_cidr_mask,
            ip_v6: ip_pool.ip_v6,
            ip_v6_cidr_mask: ip_pool.ip_v6_cidr_mask,
        });

        Ok(())
    }

    /// Lease an IP address from a pool to a device
    /// Can only be called by the DAWN authority
    pub fn lease_ip(
        ctx: Context<LeaseIp>,
        ip_v4: [u8; 4],
        ip_v4_cidr_mask: u8,
        ip_v6: [u16; 16],
        ip_v6_cidr_mask: u8,
    ) -> Result<()> {
        // Validate subnet masks
        require!(
            ip_v4_cidr_mask >= 8 && ip_v4_cidr_mask <= 32,
            DawnError::InvalidSubnetMask
        );
        require!(
            ip_v6_cidr_mask >= 8 && ip_v6_cidr_mask <= 128,
            DawnError::InvalidSubnetMask
        );

        let ip_pool = &ctx.accounts.ip_pool;

        // Validate IP V4 and V6 are in the correct ranges from the IP Pool
        // require!(
        //     ip_v4 >= ip_pool.ip_v4
        //         && ip_v4 <= ip_pool.ip_v4.map(|b| b ^ !((1 << ip_v4_cidr_mask) - 1)),
        //     DawnError::InvalidIpPoolRange
        // );

        let ip_lease = &mut ctx.accounts.ip_lease;

        ip_lease.ip_pool = ip_pool.key();
        ip_lease.device = ctx.accounts.device.key();
        ip_lease.ip_v4 = ip_v4;
        ip_lease.ip_v4_cidr_mask = ip_v4_cidr_mask;
        ip_lease.ip_v6 = ip_v6;
        ip_lease.ip_v6_cidr_mask = ip_v6_cidr_mask;

        emit!(IpLeased {
            ip_lease: ip_lease.key(),
            ip_pool: ip_lease.ip_pool,
            device: ip_lease.device,
            ip_v4: ip_lease.ip_v4,
            ip_v4_cidr_mask: ip_lease.ip_v4_cidr_mask,
            ip_v6: ip_lease.ip_v6,
            ip_v6_cidr_mask: ip_lease.ip_v6_cidr_mask,
        });

        Ok(())
    }
}
