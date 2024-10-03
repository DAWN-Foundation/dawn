use anchor_lang::prelude::*;

#[event]
pub struct BuildingAdded {
    pub owner: Pubkey,
    pub name: String,
    pub address: String,
    pub floors: u8,
}
