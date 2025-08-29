use anchor_lang::prelude::*;

use crate::constants::DISCRIMINATOR_SIZE;

#[account]
#[derive(InitSpace)]
pub struct TokenConfig {
    /// The creation timestamp
    pub created_at: i64,
    /// The DAWN mint account
    pub dawn_mint: Pubkey,
    /// The mint bump seed
    pub mint_bump: u8,
    /// The fee pool bump seed
    pub fee_pool_bump: u8,
    /// The DAO bump seed
    pub dao_bump: u8,
    /// The validator bump seed
    pub validator_bump: u8,
    /// The medallion bump seed
    pub medallion_bump: u8,
    /// The token config bump seed
    pub bump: u8,
}

impl TokenConfig {
    pub const SEED_PREFIX: &'static [u8] = b"token";
    pub const SIZE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
