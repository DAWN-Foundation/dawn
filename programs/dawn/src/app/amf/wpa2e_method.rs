use anchor_lang::prelude::*;

use crate::error::DawnError;

use super::AuthMethodFramework;

/// Parameters for WPA2-Enterprise authentication method
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub struct WPA2EnterpriseParams {
    pub radius_server: Pubkey,
    pub encryption_type: u8,
    // Additional parameters within the 128 byte limit
    pub _reserved: [u8; 95], // Padding to ensure fixed size
}

/// WPA2-Enterprise implementation
pub struct WPA2EnterpriseMethod {
    pub params: WPA2EnterpriseParams,
}

impl AuthMethodFramework for WPA2EnterpriseMethod {
    type Params = WPA2EnterpriseParams;

    fn generate_params(&self) -> Result<Self::Params> {
        // Generate WPA2 parameters
        Ok(self.params)
    }

    fn validate(&self) -> Result<()> {
        // Validate WPA2-Enterprise specific properties
        if self.params.encryption_type > 3 {
            return Err(error!(DawnError::InvalidEncryptionType));
        }
        Ok(())
    }

    fn generate_verification_data(&self, client_pubkey: Pubkey) -> Result<[u8; 64]> {
        // Generate verification data for off-chain authentication
        let mut verification_data = [0u8; 64];

        // Example implementation
        verification_data[0..32].copy_from_slice(client_pubkey.as_ref());
        verification_data[32..64].copy_from_slice(self.params.radius_server.as_ref());

        Ok(verification_data)
    }
}
