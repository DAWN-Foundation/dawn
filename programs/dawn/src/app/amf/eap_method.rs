use anchor_lang::prelude::*;

use crate::error::DawnError;

use super::AuthMethodFramework;

/// Parameters for 802.1x authentication method
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub struct EAPMethodParams {
    pub certificate_authority: Pubkey,
    pub cipher_suite: u8,
    // Additional parameters within the 128 byte limit
    pub _reserved: [u8; 95], // Padding to ensure fixed size
}

/// 802.1x EAP implementation
pub struct EAPMethod {
    pub params: EAPMethodParams,
}

impl AuthMethodFramework for EAPMethod {
    type Params = EAPMethodParams;

    fn generate_params(&self) -> Result<Self::Params> {
        // Generate EAP parameters
        // In a real implementation, this would generate secure parameters
        Ok(self.params.clone())
    }

    fn validate(&self) -> Result<()> {
        // Validate EAP-specific properties
        // For example, ensure the cipher suite is valid
        if self.params.cipher_suite > 5 {
            return Err(error!(DawnError::InvalidCipherSuite));
        }
        Ok(())
    }

    fn generate_verification_data(&self, client_pubkey: Pubkey) -> Result<[u8; 64]> {
        // Generate verification data for off-chain authentication
        // This would typically involve cryptographic operations
        let mut verification_data = [0u8; 64];

        // Example implementation - in production, this would use proper cryptography
        verification_data[0..32].copy_from_slice(client_pubkey.as_ref());
        verification_data[32..64].copy_from_slice(self.params.certificate_authority.as_ref());

        Ok(verification_data)
    }
}
