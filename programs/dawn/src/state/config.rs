use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

#[account]
#[derive(InitSpace)]
pub struct Config {
    /// The creation timestamp
    pub created_at: i64,
    /// The authority that can update the config
    pub authority: Pubkey,
    /// The authority that can make calls on user's behalf
    pub api_authority: Pubkey,

    // MINTS
    /// The token config account that owns the DAWN mint
    pub token_config: Pubkey,
    /// The USDC mint account
    pub usdc_mint: Pubkey,
    /// The DAWN mint account
    pub dawn_mint: Pubkey,

    // TOKEN ACCOUNTS
    /// The fee pool DAWN token account (this holds all the fees until distributed)
    pub fee_pool_dawn_account: Pubkey,
    /// The DAWN DAO DAWN token account
    pub dao_dawn_account: Pubkey,
    /// The validator DAWN pool token account
    pub validator_dawn_account: Pubkey,
    /// The medallion DAWN pool token account
    pub medallion_dawn_account: Pubkey,

    // DEX SWAP
    /// The Raydium program account
    pub raydium: Pubkey,
    /// The Raydium authority account
    pub raydium_authority: Pubkey,
    /// The Raydium config account
    pub raydium_config: Pubkey,
    /// The Raydium DAWN/USDC pool account
    pub raydium_pool: Pubkey,
    /// The Raydium observation account
    pub raydium_observation: Pubkey,

    // FEES - grouped the numeric types together
    /// The fee for DAWN DAO (3%)
    pub dao_fee: u64,
    /// The fee for Validators (3%)
    pub validator_fee: u64,
    /// The fee for Medallion (9%)
    pub medallion_fee: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl Config {
    pub const SEED_PREFIX: &'static [u8] = b"config";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
