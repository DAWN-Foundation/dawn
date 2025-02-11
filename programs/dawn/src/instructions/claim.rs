use anchor_lang::{prelude::*, solana_program::clock::SECONDS_PER_DAY};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use raydium_cp_swap::{cpi, program::RaydiumCpSwap, states::PoolState};

use super::{Config, DawnApp, Plan, Subscription};
use crate::{
    utils::{optional_i64_seed, optional_pubkey_seed, sort_accounts, swap_amounts},
    Claimed, DawnError,
};

#[derive(Accounts)]
pub struct Claim<'info> {
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
        address = subscription.plan,
        constraint = caller.key() == plan.owner,
        seeds = [
            b"plan",
            plan.device.as_ref(),
            &optional_pubkey_seed(plan.is_resale.then_some(plan.parent_plan)),
            &plan.price.to_le_bytes(),
            &plan.duration.to_le_bytes(),
            &plan.speed.to_le_bytes(),
            &plan.capacity.to_le_bytes(),
            &optional_i64_seed(plan.start_at),
            &plan.sla_id.to_le_bytes(),
        ],
        bump = plan.bump,
    )]
    pub plan: Box<Account<'info, Plan>>,

    /// The subscription account
    #[account(
        mut,
        seeds = [
            b"subscription",
            plan.key().as_ref(),
            subscription.subscriber.as_ref(),
        ],
        bump = subscription.bump,
    )]
    pub subscription: Box<Account<'info, Subscription>>,

    /// The DAWN token mint
    #[account(address = config.dawn_mint)]
    pub dawn_mint: Box<Account<'info, Mint>>,

    /// The USDC token mint
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    // TOKEN ACCOUNTS
    /// The plan owner escrow USDC token vault
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = plan,
    )]
    pub escrow_usdc_vault: Box<Account<'info, TokenAccount>>,

    /// The plan owner escrow DAWN token vault
    #[account(
        mut,
        associated_token::mint = dawn_mint,
        associated_token::authority = plan,
    )]
    pub escrow_dawn_vault: Box<Account<'info, TokenAccount>>,

    /// The service provider DAWN token account
    #[account(
        mut,
        associated_token::mint = dawn_mint,
        associated_token::authority = caller,
    )]
    pub service_provider_dawn_account: Box<Account<'info, TokenAccount>>,

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

    // PROGRAMS
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl DawnApp {
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let subscription_account = ctx.accounts.subscription.to_account_info();
        let plan_account = ctx.accounts.plan.to_account_info();
        let subscription_key = subscription_account.key();
        let plan_key = plan_account.key();
        let last_claim = ctx.accounts.subscription.last_claim;
        let claimable_dawn = ctx.accounts.subscription.claimable_dawn;
        let daily_usdc = ctx.accounts.subscription.daily_usdc;

        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Check if 24 hours have passed since last claim
        require!(
            current_time - last_claim >= SECONDS_PER_DAY as i64,
            DawnError::ClaimTooEarly
        );

        // Calculate number of days since last claim
        let days_since_claim = ((current_time - last_claim) / SECONDS_PER_DAY as i64) as u64;

        // Signer seeds for the subscription account
        let seeds = &[
            b"plan".as_ref(),
            ctx.accounts.plan.device.as_ref(),
            &optional_pubkey_seed(
                ctx.accounts
                    .plan
                    .is_resale
                    .then_some(ctx.accounts.plan.parent_plan),
            ),
            &ctx.accounts.plan.price.to_le_bytes(),
            &ctx.accounts.plan.duration.to_le_bytes(),
            &ctx.accounts.plan.speed.to_le_bytes(),
            &ctx.accounts.plan.capacity.to_le_bytes(),
            &optional_i64_seed(ctx.accounts.plan.start_at),
            &ctx.accounts.plan.sla_id.to_le_bytes(),
            &[ctx.accounts.plan.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let subscription = &mut ctx.accounts.subscription;

        // Handle claiming available DAWN
        if claimable_dawn > 0 {
            // Transfer claimable DAWN to subscriber
            let transfer_cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.escrow_dawn_vault.to_account_info(),
                    to: ctx.accounts.service_provider_dawn_account.to_account_info(),
                    authority: plan_account.clone(),
                },
                signer_seeds,
            );
            token::transfer(transfer_cpi_ctx, claimable_dawn)?;

            subscription.claimable_dawn = 0;
        }

        let mut swap_price = 0;

        // Handle swapping USDC for next period
        let remaining_usdc = ctx.accounts.escrow_usdc_vault.amount;
        if days_since_claim > 0 && remaining_usdc > 0 {
            // Swap daily USDC times the number of days since last claim
            // Or the remaining USDC if it's less than the cumulative daily USDC
            let usdc_to_swap = days_since_claim
                .checked_mul(daily_usdc)
                .ok_or(DawnError::Overflow)?
                .min(remaining_usdc);

            if usdc_to_swap > 0 {
                // Perform swap using Raydium
                let (pool_mint_0, pool_mint_1, pool_vault_0, pool_vault_1) = {
                    let pool_state = ctx.accounts.raydium_pool.load()?;
                    (
                        pool_state.token_0_mint,
                        pool_state.token_1_mint,
                        pool_state.token_0_vault,
                        pool_state.token_1_vault,
                    )
                };

                // Determine input and output tokens and vaults
                let (
                    input_mint,
                    input_vault,
                    input_token_account,
                    output_mint,
                    output_vault,
                    output_token_account,
                    is_usdc_base,
                ) = sort_accounts(
                    pool_mint_0,
                    pool_mint_1,
                    pool_vault_0,
                    pool_vault_1,
                    ctx.accounts.usdc_mint.to_account_info(),
                    ctx.accounts.dawn_mint.to_account_info(),
                    ctx.accounts.raydium_usdc_vault.to_account_info(),
                    ctx.accounts.raydium_dawn_vault.to_account_info(),
                    ctx.accounts.escrow_usdc_vault.to_account_info(),
                    ctx.accounts.escrow_dawn_vault.to_account_info(),
                )?;

                let (usdc_amount_in, minimum_dawn_amount_out, price) = swap_amounts(
                    &ctx.accounts.raydium_pool,
                    &ctx.accounts.raydium_usdc_vault,
                    &ctx.accounts.raydium_dawn_vault,
                    is_usdc_base,
                    usdc_to_swap,
                )?;

                swap_price = price;

                // Create CPI accounts for the swap
                let swap_cpi = cpi::accounts::Swap {
                    payer: plan_account,
                    authority: ctx.accounts.raydium_authority.to_account_info(),
                    amm_config: ctx.accounts.raydium_config.to_account_info(),
                    pool_state: ctx.accounts.raydium_pool.to_account_info(),
                    input_token_account,
                    output_token_account,
                    input_vault,
                    output_vault,
                    input_token_mint: input_mint,
                    output_token_mint: output_mint,
                    input_token_program: ctx.accounts.token_program.to_account_info(),
                    output_token_program: ctx.accounts.token_program.to_account_info(),
                    observation_state: ctx.accounts.raydium_observation.to_account_info(),
                };
                let swap_cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.raydium.to_account_info(),
                    swap_cpi,
                    signer_seeds,
                );

                if is_usdc_base {
                    // USDC is the base token; use swap_base_input
                    cpi::swap_base_input(swap_cpi_ctx, usdc_amount_in, minimum_dawn_amount_out)?;
                } else {
                    // USDC is the quote token; use swap_base_output
                    cpi::swap_base_output(swap_cpi_ctx, usdc_amount_in, minimum_dawn_amount_out)?;
                }

                // Set newly swapped DAWN as claimable after 24h
                subscription.claimable_dawn = minimum_dawn_amount_out;
            }
        }

        subscription.last_claim = current_time;

        emit!(Claimed {
            subscription: subscription_key,
            plan: plan_key,
            dawn_claimed: claimable_dawn,
            swap_price,
        });

        Ok(())
    }
}
