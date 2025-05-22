use anchor_lang::prelude::*;

/// The core trait that all authentication methods must implement
#[allow(dead_code)]
pub trait AuthMethodFramework {
    /// Required authentication parameters for this method
    type Params: AnchorSerialize + AnchorDeserialize + Clone + Copy;

    /// Generate authentication parameters for a new client
    fn generate_params(&self) -> Result<Self::Params>;

    /// Validate method-specific properties
    fn validate(&self) -> Result<()>;

    /// Generate off-chain verification data
    fn generate_verification_data(&self, client_pubkey: Pubkey) -> Result<[u8; 64]>;
}
