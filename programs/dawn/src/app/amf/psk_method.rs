#![allow(non_camel_case_types)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash;

use crate::error::DawnError;

use super::AuthMethodFramework;

/// WiFi security standards
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WiFiSecurityStandard {
    WPA2_PSK = 0,
    WPA3_PSK = 1,
}

/// WiFi encryption algorithms
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WiFiEncryption {
    AES_CCMP = 0,     // AES-CCMP (WPA2)
    AES_GCMP = 1,     // AES-GCMP (WPA3)
    AES_GCMP_256 = 2, // AES-GCMP-256 (WPA3)
}

/// Parameters for PSK (Pre-Shared Key) authentication method
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub struct PSKMethodParams {
    /// Hash of the network SSID for identification (not the SSID itself)
    pub network_id_hash: [u8; 32],

    /// WiFi security standard (WPA2/WPA3)
    pub security_standard: u8,

    /// Encryption algorithm
    pub encryption_algorithm: u8,

    /// PSK rotation interval in seconds (0 = no rotation)
    pub psk_rotation_interval: u32,

    /// Reserved for future extensions
    pub _reserved: [u8; 64],
}

impl PSKMethodParams {
    /// Creates default PSK parameters with secure defaults
    pub fn default() -> Self {
        Self {
            network_id_hash: [0; 32], // Will be set when network is registered
            security_standard: WiFiSecurityStandard::WPA3_PSK as u8,
            encryption_algorithm: WiFiEncryption::AES_GCMP as u8,
            psk_rotation_interval: 86400, // 24 hours
            _reserved: [0; 64],
        }
    }

    /// Creates new PSK parameters with custom values
    pub fn new(
        network_id_hash: [u8; 32],
        security_standard: WiFiSecurityStandard,
        encryption_algorithm: WiFiEncryption,
        psk_rotation_interval: u32,
    ) -> Self {
        Self {
            network_id_hash,
            security_standard: security_standard as u8,
            encryption_algorithm: encryption_algorithm as u8,
            psk_rotation_interval,
            _reserved: [0; 64],
        }
    }

    /// Creates secure PSK parameters for production use
    pub fn secure(network_id_hash: [u8; 32]) -> Self {
        Self {
            network_id_hash,
            security_standard: WiFiSecurityStandard::WPA3_PSK as u8,
            encryption_algorithm: WiFiEncryption::AES_GCMP_256 as u8,
            psk_rotation_interval: 3600, // 1 hour rotation
            _reserved: [0; 64],
        }
    }

    /// Validates PSK parameters
    pub fn validate(&self) -> Result<()> {
        // Validate network_id_hash
        if self.network_id_hash == [0; 32] {
            return Err(error!(DawnError::InvalidNetworkId));
        }

        // Validate security standard
        if self.security_standard > WiFiSecurityStandard::WPA3_PSK as u8 {
            return Err(error!(DawnError::InvalidSecurityStandard));
        }

        // Validate encryption algorithm
        if self.encryption_algorithm > WiFiEncryption::AES_GCMP_256 as u8 {
            return Err(error!(DawnError::InvalidEncryptionAlgorithm));
        }

        // Validate PSK rotation interval (min 1 hour, max 7 days, or 0 for no rotation)
        if self.psk_rotation_interval != 0
            && (self.psk_rotation_interval < 3600 || self.psk_rotation_interval > 604800)
        {
            return Err(error!(DawnError::InvalidRotationInterval));
        }

        Ok(())
    }
}

/// PSK credential structure stored in the Credential account
/// Format: [salt: 32 bytes][hash: 32 bytes][client_metadata: 64 bytes]
pub struct PSKCredentialData {
    /// Unique salt for this user (32 bytes)
    pub salt: [u8; 32],
    /// SHA-256 hash of salt || psk_utf8 (32 bytes)
    pub psk_hash: [u8; 32],

    /// _reserved: [u8; 64]
    pub _reserved: [u8; 64],
}

impl PSKCredentialData {
    /// Create new PSK credential data
    pub fn new(salt: [u8; 32], psk_hash: [u8; 32]) -> Self {
        Self {
            salt,
            psk_hash,
            _reserved: [0; 64],
        }
    }

    /// Serialize to [u8; 128] for storage
    pub fn serialize(&self) -> [u8; 128] {
        let mut data = [0u8; 128];
        data[0..32].copy_from_slice(&self.salt);
        data[32..64].copy_from_slice(&self.psk_hash);
        data[64..128].copy_from_slice(&self._reserved);
        data
    }

    /// Deserialize from [u8; 128]  
    pub fn deserialize(data: &[u8; 128]) -> Self {
        let mut salt = [0u8; 32];
        let mut psk_hash = [0u8; 32];
        let mut _reserved = [0u8; 64];

        salt.copy_from_slice(&data[0..32]);
        psk_hash.copy_from_slice(&data[32..64]);
        _reserved.copy_from_slice(&data[64..128]);

        Self {
            salt,
            psk_hash,
            _reserved,
        }
    }

    /// Verify PSK knowledge by recomputing hash
    pub fn verify_psk(&self, psk: &str) -> bool {
        // Add basic validation
        if psk.is_empty() || psk.len() > 256 {
            return false;
        }

        let computed_hash = Self::compute_psk_hash(&self.salt, psk);
        computed_hash == self.psk_hash
    }

    /// Compute SHA-256 hash of salt || psk_utf8
    pub fn compute_psk_hash(salt: &[u8; 32], psk: &str) -> [u8; 32] {
        let mut hasher_input = Vec::with_capacity(salt.len() + psk.len());
        hasher_input.extend_from_slice(salt);
        hasher_input.extend_from_slice(psk.as_bytes());

        // Use Solana's SHA-256
        hash::hash(&hasher_input).to_bytes()
    }
}

/// PSK authentication method implementation
pub struct PSKMethod {
    pub params: PSKMethodParams,
}

impl PSKMethod {
    /// Creates a new PSK method with default parameters
    pub fn new() -> Self {
        Self {
            params: PSKMethodParams::default(),
        }
    }

    /// Creates a new PSK method with custom parameters
    pub fn with_params(params: PSKMethodParams) -> Self {
        Self { params }
    }

    /// Creates a new PSK method with secure defaults for production use
    pub fn secure(network_id_hash: [u8; 32]) -> Self {
        Self {
            params: PSKMethodParams::secure(network_id_hash),
        }
    }
}

impl AuthMethodFramework for PSKMethod {
    type Params = PSKMethodParams;

    fn generate_params(&self) -> Result<Self::Params> {
        // Validate parameters before returning
        self.params.validate()?;
        Ok(self.params)
    }

    fn validate(&self) -> Result<()> {
        self.params.validate()
    }

    fn generate_verification_data(&self, client_pubkey: Pubkey) -> Result<[u8; 64]> {
        // Generate verification data for off-chain authentication
        let mut verification_data = [0u8; 64];

        // First 32 bytes: client public key
        verification_data[0..32].copy_from_slice(client_pubkey.as_ref());

        // Next 32 bytes: network identifier hash
        verification_data[32..64].copy_from_slice(&self.params.network_id_hash);

        Ok(verification_data)
    }
}
