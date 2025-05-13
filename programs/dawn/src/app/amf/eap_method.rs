use anchor_lang::prelude::*;

use crate::error::DawnError;

use super::AuthMethodFramework;

/// Parameters for 802.1x EAP (Extensible Authentication Protocol) authentication method
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub struct EAPMethodParams {
    /// Certificate authority public key for validating server certificates
    pub certificate_authority: Pubkey,
    
    /// Cipher suite to use for TLS communication
    /// 0 = TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
    /// 1 = TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
    /// 2 = TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
    /// 3 = TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
    /// 4 = TLS_DHE_RSA_WITH_AES_128_GCM_SHA256
    /// 5 = TLS_DHE_RSA_WITH_AES_256_GCM_SHA384
    pub cipher_suite: u8,
    
    /// EAP method type
    /// 0 = EAP-TLS (certificate-based)
    /// 1 = PEAP-MSCHAPv2 (password-based)
    /// 2 = EAP-TTLS (tunneled TLS)
    pub eap_type: u8,
    
    /// RADIUS server endpoint public key
    pub radius_server: Pubkey,
    
    /// Maximum TLS fragment size (in bytes)
    pub max_fragment_size: u16,
    
    /// Session timeout in seconds
    pub session_timeout: u32,
    
    /// Identity privacy flag (use anonymous identity in outer TLS)
    pub identity_privacy: bool,
    
    /// Server certificate validation required
    pub validate_server_cert: bool,
    
    /// Additional parameters within the remaining space of 129 byte limit
    pub _reserved: [u8; 64], // Reduced padding to accommodate new fields
}

/// 802.1x EAP implementation 
pub struct EAPMethod {
    pub params: EAPMethodParams,
}

impl AuthMethodFramework for EAPMethod {
    type Params = EAPMethodParams;

    fn generate_params(&self) -> Result<Self::Params> {
        // Generate EAP parameters
        // In a production implementation, this would generate secure parameters
        Ok(self.params.clone())
    }

    fn validate(&self) -> Result<()> {
        // Validate EAP-specific properties
        
        // Ensure the cipher suite is valid
        if self.params.cipher_suite > 5 {
            return Err(error!(DawnError::InvalidCipherSuite));
        }
        
        // Ensure the EAP type is valid
        if self.params.eap_type > 2 {
            return Err(error!(DawnError::InvalidEAPType));
        }
        
        // Ensure fragment size is reasonable (256-4096 bytes)
        if self.params.max_fragment_size < 256 || self.params.max_fragment_size > 4096 {
            return Err(error!(DawnError::InvalidFragmentSize));
        }
        
        // Ensure session timeout is reasonable (300-86400 seconds, or 5 min to 24 hours)
        if self.params.session_timeout < 300 || self.params.session_timeout > 86400 {
            return Err(error!(DawnError::InvalidSessionTimeout));
        }

        Ok(())
    }

    fn generate_verification_data(&self, client_pubkey: Pubkey) -> Result<[u8; 64]> {
        // Generate verification data for off-chain authentication
        // For EAP-TLS, this would involve cryptographic operations with certificates
        let mut verification_data = [0u8; 64];

        // Populate the verification data with client and server information
        // First 32 bytes: client public key
        verification_data[0..32].copy_from_slice(client_pubkey.as_ref());
        
        // Next 32 bytes: mix of certificate authority and RADIUS server info
        // This would typically be a cryptographic challenge or hash in production
        let ca_bytes = self.params.certificate_authority.as_ref();
        let radius_bytes = self.params.radius_server.as_ref();
        
        for i in 0..16 {
            verification_data[32 + i] = ca_bytes[i];
        }
        
        for i in 0..16 {
            verification_data[48 + i] = radius_bytes[i];
        }

        Ok(verification_data)
    }
}
