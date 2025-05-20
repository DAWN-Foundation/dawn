use anchor_lang::prelude::*;

use crate::error::DawnError;

use super::AuthMethodFramework;

/// EAP Type constants for 802.1x authentication
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EAPType {
    EAP_TLS = 0,      // Certificate-based
    PEAP_MSCHAPV2 = 1, // Password-based
    EAP_TTLS = 2,     // Tunneled TLS
}

/// Cipher Suite constants for TLS encryption
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CipherSuite {
    TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 = 0,
    TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 = 1,
    TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 = 2,
    TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 = 3,
    TLS_DHE_RSA_WITH_AES_128_GCM_SHA256 = 4,
    TLS_DHE_RSA_WITH_AES_256_GCM_SHA384 = 5,
}

/// Parameters for 802.1x EAP (Extensible Authentication Protocol) authentication method
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub struct EAPMethodParams {
    /// Certificate authority public key for validating server certificates
    pub certificate_authority: Pubkey,

    /// Cipher suite to use for TLS communication
    pub cipher_suite: u8,

    /// EAP method type
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
    pub _reserved: [u8; 64],
}

impl EAPMethodParams {
    /// Creates default EAP parameters with secure defaults
    pub fn default() -> Self {
        Self {
            certificate_authority: Pubkey::default(),
            cipher_suite: CipherSuite::TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 as u8,
            eap_type: EAPType::EAP_TLS as u8,
            radius_server: Pubkey::default(),
            max_fragment_size: 1400, // Reasonable size for Ethernet frames
            session_timeout: 3600,   // 1 hour in seconds
            identity_privacy: true,  // Use anonymous identity for privacy
            validate_server_cert: true, // Validate server certificate for security
            _reserved: [0; 64],
        }
    }

    /// Creates new EAP parameters with custom values
    pub fn new(
        certificate_authority: Pubkey,
        radius_server: Pubkey,
        cipher_suite: CipherSuite,
        eap_type: EAPType,
        max_fragment_size: u16,
        session_timeout: u32,
        identity_privacy: bool,
        validate_server_cert: bool,
    ) -> Self {
        Self {
            certificate_authority,
            cipher_suite: cipher_suite as u8,
            eap_type: eap_type as u8,
            radius_server,
            max_fragment_size,
            session_timeout,
            identity_privacy,
            validate_server_cert,
            _reserved: [0; 64],
        }
    }

    /// Validates EAP parameters
    pub fn validate(&self) -> Result<()> {
        // Validate cipher suite
        if self.cipher_suite > CipherSuite::TLS_DHE_RSA_WITH_AES_256_GCM_SHA384 as u8 {
            return Err(error!(DawnError::InvalidCipherSuite));
        }

        // Validate EAP type
        if self.eap_type > EAPType::EAP_TTLS as u8 {
            return Err(error!(DawnError::InvalidEAPType));
        }

        // Validate fragment size (256-4096 bytes)
        if self.max_fragment_size < 256 || self.max_fragment_size > 4096 {
            return Err(error!(DawnError::InvalidFragmentSize));
        }

        // Validate session timeout (300-86400 seconds, or 5 min to 24 hours)
        if self.session_timeout < 300 || self.session_timeout > 86400 {
            return Err(error!(DawnError::InvalidSessionTimeout));
        }

        Ok(())
    }
}

/// 802.1x EAP implementation
pub struct EAPMethod {
    pub params: EAPMethodParams,
}

impl EAPMethod {
    /// Creates a new EAP method with default parameters
    pub fn new() -> Self {
        Self {
            params: EAPMethodParams::default(),
        }
    }

    /// Creates a new EAP method with custom parameters
    pub fn with_params(params: EAPMethodParams) -> Self {
        Self { params }
    }

    /// Creates a new EAP method with secure defaults for production use
    pub fn secure(
        certificate_authority: Pubkey,
        radius_server: Pubkey,
    ) -> Self {
        Self {
            params: EAPMethodParams::new(
                certificate_authority,
                radius_server,
                CipherSuite::TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
                EAPType::EAP_TLS,
                1400,
                3600,
                true,
                true,
            ),
        }
    }
}

impl AuthMethodFramework for EAPMethod {
    type Params = EAPMethodParams;

    fn generate_params(&self) -> Result<Self::Params> {
        // Validate parameters before returning
        self.params.validate()?;
        Ok(self.params.clone())
    }

    fn validate(&self) -> Result<()> {
        self.params.validate()
    }

    fn generate_verification_data(&self, client_pubkey: Pubkey) -> Result<[u8; 64]> {
        // Generate verification data for off-chain authentication
        let mut verification_data = [0u8; 64];

        // First 32 bytes: client public key
        verification_data[0..32].copy_from_slice(client_pubkey.as_ref());

        // Next 32 bytes: mix of certificate authority and RADIUS server info
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
