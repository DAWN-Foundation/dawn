use anchor_lang::{prelude::*, solana_program::pubkey::MAX_SEED_LEN};
use std::cmp::min;

use crate::{
    constants::MAX_SITE_NAME_LEN,
    events::{DeviceAssignedToSite, SiteAdded},
    DawnApp, DawnError,
};

use crate::state::{Device, Site};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct AddSite<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The site account
    #[account(
        init,
        payer = caller,
        space = Site::SIZE,
        seeds = [
            Site::SEED_PREFIX.as_ref(),
            caller.key().as_ref(),
            &name.as_bytes()[..min(name.len(), MAX_SEED_LEN)],
        ],
        bump,
    )]
    pub site: Account<'info, Site>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AssignDeviceToSite<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The site account
    #[account(
        mut,
        constraint = site.owner == caller.key(),
        seeds = [
            Site::SEED_PREFIX.as_ref(),
            site.owner.as_ref(),
            &site.name.as_bytes()[..min(site.name.len(), MAX_SEED_LEN)],
        ],
        bump = site.bump,
    )]
    pub site: Account<'info, Site>,

    /// The device account
    #[account(
        mut,
        constraint = device.owner == caller.key(),
        seeds = [
            Device::SEED_PREFIX.as_ref(),
            device.owner.as_ref(),
            &device.model.as_ref(),
            &device.name.as_bytes()[..min(device.name.len(), MAX_SEED_LEN)],
            &device.mac_address,
        ],
        bump = device.bump,
    )]
    pub device: Account<'info, Device>,

    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn add_site(ctx: Context<AddSite>, name: String) -> Result<()> {
        // Make sure the name is not empty
        require!(!name.is_empty(), DawnError::InvalidSiteName);

        // Make sure the name is not too long
        require!(name.len() <= MAX_SITE_NAME_LEN, DawnError::InvalidSiteName);

        let site = &mut ctx.accounts.site;

        // Set site info
        site.created_at = Clock::get()?.unix_timestamp;
        site.owner = ctx.accounts.caller.key();
        site.name.clone_from(&name);
        site.bump = ctx.bumps.site;

        // Emit event
        emit!(SiteAdded {
            site: site.key(),
            owner: site.owner,
            name,
            created_at: site.created_at,
        });

        Ok(())
    }

    pub fn assign_device_to_site(ctx: Context<AssignDeviceToSite>) -> Result<()> {
        let site = &mut ctx.accounts.site;
        let device = &mut ctx.accounts.device;

        // Set device info
        device.site = Some(site.key());

        // Emit event
        emit!(DeviceAssignedToSite {
            device: device.key(),
            site: site.key(),
            created_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
