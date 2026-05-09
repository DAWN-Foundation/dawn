use anchor_lang::prelude::*;

#[error_code]
pub enum DawnError {
    // COMMON
    #[msg("Insufficient funds")]
    InsufficientFunds,

    #[msg("Arithmetic operation overflowed")]
    Overflow,

    #[msg("Arithmetic operation underflowed")]
    Underflow,

    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    // DEVICE
    #[msg("Device manufacturer is empty")]
    EmptyDeviceManufacturer,

    #[msg("Device model is empty")]
    EmptyDeviceModel,

    #[msg("Device manufacturer is too long")]
    DeviceManufacturerTooLong,

    #[msg("Device model is too long")]
    DeviceModelTooLong,

    #[msg("Device name is empty")]
    EmptyDeviceName,

    #[msg("Device name is too long")]
    DeviceNameTooLong,

    #[msg("Device height is invalid")]
    InvalidHeight,

    #[msg("Latitude coordinate is invalid")]
    InvalidLatitude,

    #[msg("Longitude coordinate is invalid")]
    InvalidLongitude,

    #[msg("Invalid placement azimuth")]
    InvalidPlacementAzimuth,

    #[msg("Invalid placement tilt")]
    InvalidPlacementTilt,

    #[msg("Device type is invalid")]
    InvalidDeviceType,

    // LOCAL DOMAIN
    #[msg("Local domain name is too long")]
    LocalDomainNameTooLong,

    #[msg("Local domain name is empty")]
    EmptyLocalDomainName,

    #[msg("Invalid coverage status (must be 0..=3)")]
    InvalidStatus,

    // ACCESS DOMAIN
    #[msg("Access domain name is empty")]
    EmptyAccessDomainName,

    #[msg("Access domain name is too long")]
    AccessDomainNameTooLong,

    #[msg("Invalid control plane device (cannot be default Pubkey)")]
    InvalidControlPlaneDevice,

    #[msg("Only the access-domain owner may perform this action")]
    OnlyAccessDomainOwner,

    // AMF
    #[msg("Invalid auth method type")]
    InvalidAuthMethodType,

    #[msg("Invalid security standard")]
    InvalidSecurityStandard,

    #[msg("Invalid encryption algorithm")]
    InvalidEncryptionAlgorithm,

    #[msg("Invalid PSK rotation interval")]
    InvalidRotationInterval,

    #[msg("PSKMethodParams: at least one band (2.4/5/6 GHz) must be active")]
    PskNoActiveBand,

    #[msg("PSKMethodParams: SSID label length out of range")]
    InvalidSsidLabelLen,

    #[msg("PSKMethodParams: SSID label is not valid utf-8 in its declared prefix")]
    InvalidSsidUtf8,

    #[msg("AuthMethod's access_domain does not match the provided AccessDomain")]
    AuthMethodAccessDomainMismatch,

    #[msg("update_auth_method_params: caller must be access_domain.owner OR a live ConfigPlaneManager")]
    OnlyOwnerOrConfigPlaneManager,

    // CREDENTIAL
    #[msg("Credential's access_domain does not match the provided AccessDomain")]
    CredentialAccessDomainMismatch,

    #[msg("Credential's auth_method does not match the provided AuthMethod")]
    CredentialAuthMethodMismatch,

    #[msg("Caller is not authorized to revoke this credential")]
    UnauthorizedCredentialRevoke,

    #[msg("Invalid VLAN id (must be in 1..=4094)")]
    InvalidVlanId,

    // DOMAIN AUTHORITY (Tier-2 role grants)
    #[msg("Invalid domain authority (cannot be default Pubkey)")]
    InvalidDomainAuthority,

    #[msg("Domain authority label too long (max 32 chars)")]
    DomainAuthorityLabelTooLong,

    #[msg("Domain authority expires_at is already in the past")]
    DomainAuthorityAlreadyExpired,

    #[msg("DomainAuthority.domain does not match the provided domain")]
    DomainAuthorityDomainMismatch,

    #[msg("DomainAuthority has the wrong role for this operation")]
    DomainAuthorityWrongRole,

    #[msg("Caller does not match DomainAuthority.authority")]
    DomainAuthoritySignerMismatch,

    #[msg("DomainAuthority has expired")]
    DomainAuthorityExpired,

    // SEED ENCODING
    #[msg("Invalid UTF-8 in seed data")]
    InvalidUtf8InSeed,
}
