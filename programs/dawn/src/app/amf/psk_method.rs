#![allow(non_camel_case_types, dead_code)]

use anchor_lang::prelude::*;

use crate::error::DawnError;

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

/// Parameters for PSK / MPSK authentication method.
///
/// Wire layout (Borsh, total 128 bytes — parsed as a 128-byte prefix of
/// the AuthMethod's 256-byte parameters buffer):
///
///   security_standard:        u8         // 1
///   encryption_algorithm:     u8         // 1
///   psk_rotation_interval:    u32 LE     // 4
///   ssid_2_4ghz_len:          u8         // 1
///   ssid_2_4ghz:              [u8; 32]   // 32
///   ssid_5ghz_len:            u8         // 1
///   ssid_5ghz:                [u8; 32]   // 32
///   ssid_6ghz_len:            u8         // 1
///   ssid_6ghz:                [u8; 32]   // 32
///   _reserved:                [u8; 23]   // 23
///                                         = 128
///
/// Per-band SSID slots: `len == 0` means the band is not active. At least
/// one band must be active. Same security spec applies to all populated
/// bands (per-band security can be added in the reserved bytes later).
///
/// PDA discrimination of the AuthMethod uses (access_domain, method_type)
/// — NOT a hash of the parameters. So updates to params via
/// `update_auth_method_params` mutate in place at the same PDA.
#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub struct PSKMethodParams {
    pub security_standard: u8,
    pub encryption_algorithm: u8,
    pub psk_rotation_interval: u32,

    pub ssid_2_4ghz_len: u8,
    pub ssid_2_4ghz: [u8; 32],
    pub ssid_5ghz_len: u8,
    pub ssid_5ghz: [u8; 32],
    pub ssid_6ghz_len: u8,
    pub ssid_6ghz: [u8; 32],

    pub _reserved: [u8; 23],
}

impl PSKMethodParams {
    /// Wire size in bytes (parsed from the AuthMethod parameters prefix).
    pub const SIZE: usize = 128;

    pub fn validate(&self) -> Result<()> {
        // Security and encryption ranges
        if self.security_standard > WiFiSecurityStandard::WPA3_PSK as u8 {
            return Err(error!(DawnError::InvalidSecurityStandard));
        }
        if self.encryption_algorithm > WiFiEncryption::AES_GCMP_256 as u8 {
            return Err(error!(DawnError::InvalidEncryptionAlgorithm));
        }
        // Rotation: 0 (disabled) or in [1h, 7d]
        if self.psk_rotation_interval != 0
            && (self.psk_rotation_interval < 3600 || self.psk_rotation_interval > 604800)
        {
            return Err(error!(DawnError::InvalidRotationInterval));
        }

        // At least one band populated, each populated label has len in 1..=32,
        // and label bytes within the prefix length form valid utf-8.
        let any_band = self.ssid_2_4ghz_len > 0
            || self.ssid_5ghz_len > 0
            || self.ssid_6ghz_len > 0;
        if !any_band {
            return Err(error!(DawnError::PskNoActiveBand));
        }
        validate_band(self.ssid_2_4ghz_len, &self.ssid_2_4ghz)?;
        validate_band(self.ssid_5ghz_len, &self.ssid_5ghz)?;
        validate_band(self.ssid_6ghz_len, &self.ssid_6ghz)?;

        Ok(())
    }
}

fn validate_band(len: u8, label: &[u8; 32]) -> Result<()> {
    if len == 0 {
        return Ok(());
    }
    if (len as usize) > label.len() {
        return Err(error!(DawnError::InvalidSsidLabelLen));
    }
    // utf-8 well-formedness within the declared prefix
    if std::str::from_utf8(&label[..len as usize]).is_err() {
        return Err(error!(DawnError::InvalidSsidUtf8));
    }
    Ok(())
}

// PSKMethod / PSKCredentialData / AuthMethodFramework-impl-for-PSK have
// been removed. The Credential's `sealed_payload` is now an opaque
// libsodium sealed-box envelope (sealed off-chain to AccessDomain.cpd's
// owner pubkey); the program never reads it. The on-chain consumer of
// PSKMethodParams is `validate_auth_params` in register_auth_method.rs.
