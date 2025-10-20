use anchor_lang::prelude::*;

use crate::error::DawnError;

use super::AuthMethodFramework;

/// IPsec Authentication Header (AH) algorithms
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IPsecAlgorithm {
    HMAC_MD5_96 = 0,      // RFC 2403 (legacy, not recommended)
    HMAC_SHA1_96 = 1,     // RFC 2404 (legacy, not recommended)
    HMAC_SHA256_128 = 2,  // RFC 4868 (recommended)
    HMAC_SHA384_192 = 3,  // RFC 4868
    HMAC_SHA512_256 = 4,  // RFC 4868
    AES_XCBC_96 = 5,      // RFC 3566
    AES_CMAC_96 = 6,      // RFC 4494
    AES_GMAC_128 = 7,     // RFC 4543
    BLAKE2S_128 = 8,      // RFC 7693 (high performance)
}

/// IPsec modes of operation
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IPsecMode {
    TRANSPORT = 0, // End-to-end security between hosts
    TUNNEL = 1,    // Gateway-to-gateway or host-to-gateway security
}

/// IKEv2 parameters for key exchange
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub struct IKEv2Params {
    /// Diffie-Hellman group number
    pub dh_group: u8,
    /// Encryption algorithm identifier
    pub encryption_algorithm: u8,
    /// Integrity algorithm identifier
    pub integrity_algorithm: u8,
    /// Pseudo-random function algorithm
    pub prf_algorithm: u8,
    /// Enable automatic rekeying
    pub rekey: bool,
    /// SA lifetime in seconds
    pub lifetime_seconds: u32,
}

/// Parameters for IPsec Authentication Header (AH) authentication method
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub struct IPsecAHParams {
    /// Authentication algorithm
    pub algorithm: u8,
    /// Key lifetime in seconds
    pub key_lifetime: u32,
    /// Transport or Tunnel mode
    pub mode: u8,
    /// Security Parameter Index
    pub spi: u32,
    /// Anti-replay window size
    pub replay_window_size: u8,
    /// Use 64-bit extended sequence numbers
    pub use_extended_sequence: bool,
    /// IKEv2 parameters for key exchange
    pub ike_params: IKEv2Params,
    /// Reserved for future extensions
    pub _reserved: [u8; 64],
}

impl IPsecAHParams {
    /// Creates default IPsec AH parameters with secure defaults
    pub fn default() -> Self {
        Self {
            algorithm: IPsecAlgorithm::HMAC_SHA256_128 as u8,
            key_lifetime: 28800, // 8 hours in seconds
            mode: IPsecMode::TRANSPORT as u8,
            spi: 0, // Will be set to random value in production
            replay_window_size: 64,
            use_extended_sequence: true,
            ike_params: IKEv2Params {
                dh_group: 14, // 2048-bit MODP Group
                encryption_algorithm: 12, // AES-GCM with 16 octet ICV
                integrity_algorithm: 12, // HMAC-SHA256-128
                prf_algorithm: 5, // PRF-HMAC-SHA2-256
                rekey: true,
                lifetime_seconds: 28800, // 8 hours
            },
            _reserved: [0; 64],
        }
    }

    /// Creates new IPsec AH parameters with custom values
    pub fn new(
        algorithm: IPsecAlgorithm,
        key_lifetime: u32,
        mode: IPsecMode,
        spi: u32,
        replay_window_size: u8,
        use_extended_sequence: bool,
        ike_params: IKEv2Params,
    ) -> Self {
        Self {
            algorithm: algorithm as u8,
            key_lifetime,
            mode: mode as u8,
            spi,
            replay_window_size,
            use_extended_sequence,
            ike_params,
            _reserved: [0; 64],
        }
    }

    /// Validates IPsec AH parameters
    pub fn validate(&self) -> Result<()> {
        // Check algorithm is valid
        if self.algorithm > IPsecAlgorithm::BLAKE2S_128 as u8 {
            return Err(error!(DawnError::InvalidIPsecAlgorithm));
        }

        // Check key lifetime is reasonable (300-86400 seconds, 5 min to 24 hours)
        if self.key_lifetime < 300 || self.key_lifetime > 86400 {
            return Err(error!(DawnError::InvalidKeyLifetime));
        }

        // Check mode is valid
        if self.mode > IPsecMode::TUNNEL as u8 {
            return Err(error!(DawnError::InvalidIPsecMode));
        }

        // Check replay window size is valid (must be power of 2, max 128 for u8)
        if self.replay_window_size < 4 
            || self.replay_window_size > 128 
            || (self.replay_window_size & (self.replay_window_size - 1)) != 0 {
            return Err(error!(DawnError::InvalidReplayWindowSize));
        }

        // Validate IKE params
        if self.ike_params.dh_group < 1 || self.ike_params.dh_group > 31 {
            return Err(error!(DawnError::InvalidDHGroup));
        }

        Ok(())
    }
}

/// IPsec Authentication Header implementation
pub struct IPsecAHMethod {
    pub params: IPsecAHParams,
}

impl IPsecAHMethod {
    /// Creates a new IPsec AH method with default parameters
    pub fn new() -> Self {
        Self {
            params: IPsecAHParams::default(),
        }
    }

    /// Creates a new IPsec AH method with custom parameters
    pub fn with_params(params: IPsecAHParams) -> Self {
        Self { params }
    }

    /// Creates a new IPsec AH method with secure defaults for production use
    pub fn secure(spi: u32) -> Self {
        Self {
            params: IPsecAHParams::new(
                IPsecAlgorithm::HMAC_SHA256_128,
                28800, // 8 hours
                IPsecMode::TRANSPORT,
                spi,
                64,
                true,
                IKEv2Params {
                    dh_group: 14,
                    encryption_algorithm: 12,
                    integrity_algorithm: 12,
                    prf_algorithm: 5,
                    rekey: true,
                    lifetime_seconds: 28800,
                },
            ),
        }
    }
}

impl AuthMethodFramework for IPsecAHMethod {
    type Params = IPsecAHParams;

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

        // Next 32 bytes: mix of SPI and algorithm info
        // This would typically be a cryptographic challenge or hash in production
        let spi_bytes = self.params.spi.to_le_bytes();
        let algorithm_bytes = [self.params.algorithm, self.params.mode, self.params.replay_window_size];

        for i in 0..4 {
            verification_data[32 + i] = spi_bytes[i];
        }

        for i in 0..3 {
            verification_data[36 + i] = algorithm_bytes[i];
        }

        // Fill remaining bytes with IKE parameters
        verification_data[39] = self.params.ike_params.dh_group;
        verification_data[40] = self.params.ike_params.encryption_algorithm;
        verification_data[41] = self.params.ike_params.integrity_algorithm;
        verification_data[42] = self.params.ike_params.prf_algorithm;
        verification_data[43] = if self.params.ike_params.rekey { 1 } else { 0 };

        let lifetime_bytes = self.params.ike_params.lifetime_seconds.to_le_bytes();
        for i in 0..4 {
            verification_data[44 + i] = lifetime_bytes[i];
        }

        Ok(verification_data)
    }
}
