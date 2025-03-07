use anchor_lang::{prelude::*, solana_program::clock::SECONDS_PER_DAY};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use raydium_cp_swap::{
    cpi,
    program::RaydiumCpSwap,
    states::{PoolState, Q32},
};
use solana_program::pubkey::MAX_SEED_LEN;
use std::cmp::min;

use super::{Config, DawnApp, Device, Plan};
use crate::{
    constants::BPS_DENOMINATOR,
    events::SubscriptionExtended,
    utils::{optional_pubkey_seed, sort_accounts, swap_amounts},
    DawnError, Subscribed,
};

/// The plan account, representing a subscription plan tied to a device
#[account]
pub struct Subscription {
    /// The creation timestamp
    pub created_at: i64,
    /// Associated subscription plan
    pub plan: Pubkey,
    /// The plan subscriber
    pub subscriber: Pubkey,
    /// The device that is subscribed to the plan (optional for mobile subscribers without devices)
    pub device: Option<Pubkey>,
    /// Subscription expiration time (UNIX timestamp in seconds)
    pub expiration: i64,
    /// Last claim timestamp for DAWN tokens
    pub last_claim: i64,
    /// Next claimable amount of DAWN tokens
    pub claimable_dawn: u64,
    /// Daily USDC portion for swaps
    pub daily_usdc: u64,
    /// PDA bump seed
    pub bump: u8,
}

const SUBSCRIPTION_SIZE: usize = 8 // id
    + 8 // created_at 
    + 32 // plan
    + 32 // subscriber
    + (1 + 32) // optional + device
    + 8 // expiration
    + 8 // last_claim
    + 8 // claimable_dawn
    + 8 // daily_usdc
    + 1; // bump

#[derive(Accounts)]
pub struct ExtendSubscription<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and accounts
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// The plan account
    #[account(
        seeds = [
            b"plan",
            plan.access_domain.as_ref(),
            plan.device.as_ref(),
            &optional_pubkey_seed(plan.is_resale.then_some(plan.parent_plan)),
            &plan.name.as_bytes(),
            &plan.price.to_le_bytes(),
            &plan.duration.to_le_bytes(),
            &plan.speed.to_le_bytes(),
            &plan.capacity.to_le_bytes(),
            &plan.start_at.to_le_bytes(),
            plan.service_agreement.as_ref(),
        ],
        bump = plan.bump
    )]
    pub plan: Box<Account<'info, Plan>>,

    /// The subscription account
    #[account(
        mut,
        seeds = [
            b"subscription",
            plan.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump = subscription.bump
    )]
    pub subscription: Box<Account<'info, Subscription>>,
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The config with fees and accounts
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// The plan account
    #[account(
        seeds = [
            b"plan",
            plan.access_domain.as_ref(),
            plan.device.as_ref(),
            &optional_pubkey_seed(plan.is_resale.then_some(plan.parent_plan)),
            &plan.name.as_bytes(),
            &plan.price.to_le_bytes(),
            &plan.duration.to_le_bytes(),
            &plan.speed.to_le_bytes(),
            &plan.capacity.to_le_bytes(),
            &plan.start_at.to_le_bytes(),
            plan.service_agreement.as_ref(),
        ],
        bump = plan.bump
    )]
    pub plan: Box<Account<'info, Plan>>,

    /// The device account
    #[account(
        constraint = device.owner == caller.key(),
        seeds = [
            b"device",
            device.owner.as_ref(),
            device.model.as_ref(),
            &device.name.as_bytes()[..min(device.name.len(), MAX_SEED_LEN)],
            &device.mac_address,
        ],
        bump = device.bump
    )]
    pub device: Option<Box<Account<'info, Device>>>,

    /// The subscription account
    #[account(
        init,
        payer = caller,
        space = SUBSCRIPTION_SIZE,
        seeds = [
            b"subscription",
            plan.key().as_ref(),
            caller.key().as_ref(),
        ],
        bump
    )]
    pub subscription: Box<Account<'info, Subscription>>,

    // MINTS
    /// The DAWN mint account
    #[account(address = config.dawn_mint)]
    pub dawn_mint: Box<Account<'info, Mint>>,
    /// The USDC mint account
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    // RAYDIUM
    /// The Raydium program account
    #[account(address = config.raydium)]
    pub raydium: Program<'info, RaydiumCpSwap>,

    /// The Raydium authority account
    /// CHECK: Verified against the config
    #[account(address = config.raydium_authority)]
    pub raydium_authority: UncheckedAccount<'info>,

    /// The Raydium config account
    /// CHECK: Verified in Raydium upon CPI
    #[account(address = config.raydium_config)]
    pub raydium_config: UncheckedAccount<'info>,

    /// The Raydium pool account
    /// CHECK: Address checked to match the pool from config
    #[account(mut, address = config.raydium_pool)]
    pub raydium_pool: AccountLoader<'info, PoolState>,

    /// The Raydium observation account
    /// CHECK: Address checked to match the pool observation key
    #[account(mut, address = config.raydium_observation)]
    pub raydium_observation: UncheckedAccount<'info>,

    // VAULTS
    /// The DAWN pool vault account
    #[account(
        mut,
        token::mint = dawn_mint,
    )]
    pub raydium_dawn_vault: Box<Account<'info, TokenAccount>>,

    /// The USDC pool vault account
    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub raydium_usdc_vault: Box<Account<'info, TokenAccount>>,

    // TOKEN ACCOUNTS
    /// The callers associated DAWN token account
    #[account(
        mut,
        associated_token::mint = dawn_mint,
        associated_token::authority = caller,
    )]
    pub user_dawn_account: Box<Account<'info, TokenAccount>>,

    /// The callers associated USDC token account
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = caller,
    )]
    pub user_usdc_account: Box<Account<'info, TokenAccount>>,

    /// The DAWN DAO DAWN token account
    #[account(mut, address = config.dao_dawn_account)]
    pub dao_dawn_account: Box<Account<'info, TokenAccount>>,

    /// The Validator DAWN pool token account
    #[account(mut,address = config.validator_dawn_account)]
    pub validator_dawn_account: Box<Account<'info, TokenAccount>>,

    /// The Medallion DAWN pool token account
    #[account(mut, address = config.medallion_dawn_account)]
    pub medallion_dawn_account: Box<Account<'info, TokenAccount>>,

    /// The device owner escrow USDC token vault
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = usdc_mint,
        associated_token::authority = plan,
    )]
    pub escrow_usdc_vault: Box<Account<'info, TokenAccount>>,

    /// The device owner escrow DAWN token vault
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = dawn_mint,
        associated_token::authority = plan,
    )]
    pub escrow_dawn_vault: Box<Account<'info, TokenAccount>>,

    // PROGRAMS
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl DawnApp {
    fn calculate_usdc_fee(
        source: u64,
        dao_fee_bps: u64,
        validator_fee_bps: u64,
        medallion_fee_bps: u64,
        plan_duration: u16,
    ) -> Result<(u64, u64, u64)> {
        let dao_usdc_fee = source
            .checked_mul(dao_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(DawnError::Underflow)?;

        let validator_usdc_fee = source
            .checked_mul(validator_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(DawnError::Underflow)?;

        let medallion_usdc_fee = source
            .checked_mul(medallion_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(DawnError::Underflow)?;

        let total_usdc_fee = dao_usdc_fee
            .checked_add(validator_usdc_fee)
            .ok_or(DawnError::Overflow)?
            .checked_add(medallion_usdc_fee)
            .ok_or(DawnError::Overflow)?;

        let remainder = source.saturating_sub(total_usdc_fee);

        let escrow_dawn_in_usdc = remainder
            .checked_div(plan_duration as u64)
            .ok_or(DawnError::Underflow)?;

        let escrow_usdc_remainder = remainder.saturating_sub(escrow_dawn_in_usdc);

        Ok((total_usdc_fee, escrow_dawn_in_usdc, escrow_usdc_remainder))
    }

    fn calculate_dawn_fees(
        total_dawn: u64,
        escrow_dawn_in_usdc: u64,
        price: u128,
        dao_fee_bps: u64,
        validator_fee_bps: u64,
        medallion_fee_bps: u64,
    ) -> Result<(u64, u64, u64, u64)> {
        // Calculate escrow DAWN amount based on the USDC amount and price
        let escrow_dawn = (escrow_dawn_in_usdc as u128)
            .checked_mul(price)
            .ok_or(DawnError::Overflow)?
            .checked_div(Q32)
            .ok_or(DawnError::Underflow)? as u64;

        // The remaining DAWN is for fees
        let remaining_dawn = total_dawn.saturating_sub(escrow_dawn);

        // Calculate total fee basis points
        let total_fee_bps = dao_fee_bps + validator_fee_bps + medallion_fee_bps;

        // Calculate each fee based on the total source amount
        let dao_dawn_fee = remaining_dawn
            .checked_mul(dao_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(total_fee_bps)
            .ok_or(DawnError::Underflow)?;

        let validator_dawn_fee = remaining_dawn
            .checked_mul(validator_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(total_fee_bps)
            .ok_or(DawnError::Underflow)?;

        let medallion_dawn_fee = remaining_dawn
            .checked_mul(medallion_fee_bps)
            .ok_or(DawnError::Overflow)?
            .checked_div(total_fee_bps)
            .ok_or(DawnError::Underflow)?;

        Ok((
            dao_dawn_fee,
            validator_dawn_fee,
            medallion_dawn_fee,
            escrow_dawn,
        ))
    }

    

    pub fn extend_subscription(ctx: Context<ExtendSubscription>) -> Result<()> {
        let plan = &ctx.accounts.plan;
        let subscription = &mut ctx.accounts.subscription;

        // Calculate subscription expiration by adding plan `duration` days to current subscription expiration
        let expiration = subscription.expiration + (plan.duration as i64);

        // Save subscription data
        subscription.expiration = expiration;

        emit!(SubscriptionExtended {
            subscription: subscription.key(),
            plan: plan.key(),
            subscriber: ctx.accounts.caller.key(),
            device: subscription.device,
            expiration: subscription.expiration,
            created_at: subscription.created_at,
        });

        Ok(())
    }
}
