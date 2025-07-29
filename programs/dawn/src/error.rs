use anchor_lang::prelude::*;

#[error_code]
pub enum DawnError {
    // COMMON
    #[msg("Insufficient funds")]
    InsufficientFunds,

    #[msg("Invalid mint")]
    InvalidMint,

    #[msg("Arithmetic operation overflowed")]
    Overflow,

    #[msg("Arithmetic operation underflowed")]
    Underflow,

    // IP POOL
    #[msg("Invalid IP range")]
    InvalidIpRange,

    #[msg("Invalid subnet mask")]
    InvalidSubnetMask,

    // SITE
    #[msg("Invalid site name")]
    InvalidSiteName,

    #[msg("Invalid site owner")]
    InvalidSiteOwner,

    // DEVICE
    #[msg("Device manufacturer is empty")]
    EmptyDeviceManufacturer,

    #[msg("Device model is empty")]
    EmptyDeviceModel,

    #[msg("Device manufacturer is too long")]
    DeviceManufacturerTooLong,

    #[msg("Device model is too long")]
    DeviceModelTooLong,

    #[msg("Access domain is required")]
    AccessDomainRequired,

    // PLAN
    #[msg("Plan price is zero")]
    ZeroPlanPrice,

    #[msg("Plan duration is zero")]
    ZeroPlanDuration,

    #[msg("Plan speed is zero")]
    ZeroPlanSpeed,

    #[msg("Plan is expired")]
    PlanExpired,

    // CLAIM
    #[msg("Invalid vault")]
    InvalidVault,

    #[msg("Claim too early")]
    ClaimTooEarly,

    #[msg("Device height is invalid")]
    InvalidHeight,

    #[msg("Latitude coordinate is invalid")]
    InvalidLatitude,

    #[msg("Longitude coordinate is invalid")]
    InvalidLongitude,

    #[msg("Parent plan needs subscription")]
    ParentPlanNeedSubscription,

    #[msg("Outside parent bounds")]
    OutsideParentBounds,

    #[msg("Invalid start time")]
    InvalidStartTime,

    #[msg("Zero payout ratio")]
    ZeroPayoutRatio,

    #[msg("Zero threshold")]
    ZeroThreshold,

    #[msg("Duplicate auth methods")]
    DuplicateAuthMethods,

    #[msg("Too many auth methods")]
    TooManyAuthMethods,

    #[msg("Invalid auth method type")]
    InvalidAuthMethodType,

    #[msg("Plan name is too long")]
    PlanNameTooLong,

    #[msg("Plan name is empty")]
    EmptyPlanName,

    #[msg("Device name is too long")]
    DeviceNameTooLong,

    #[msg("Device name is empty")]
    EmptyDeviceName,

    #[msg("Invalid placement azimuth")]
    InvalidPlacementAzimuth,

    #[msg("Invalid placement tilt")]
    InvalidPlacementTilt,

    #[msg("Inactive auth method")]
    InactiveAuthMethod,

    #[msg("Invalid cipher suite")]
    InvalidCipherSuite,

    #[msg("Invalid encryption type")]
    InvalidEncryptionType,

    #[msg("Invalid EAP type")]
    InvalidEAPType,

    #[msg("Invalid fragment size")]
    InvalidFragmentSize,

    #[msg("Invalid session timeout")]
    InvalidSessionTimeout,

    // LOCAL DOMAIN
    #[msg("Local domain name is too long")]
    LocalDomainNameTooLong,

    #[msg("Local domain name is empty")]
    EmptyLocalDomainName,

    // PSK AUTH METHOD
    #[msg("Invalid security standard")]
    InvalidSecurityStandard,

    #[msg("Invalid encryption algorithm")]
    InvalidEncryptionAlgorithm,

    #[msg("Invalid rotation interval")]
    InvalidRotationInterval,

    #[msg("Invalid network identifier")]
    InvalidNetworkId,

    // IPSEC AUTH METHOD
    #[msg("Invalid IPsec algorithm")]
    InvalidIPsecAlgorithm,

    #[msg("Invalid key lifetime")]
    InvalidKeyLifetime,

    #[msg("Invalid IPsec mode")]
    InvalidIPsecMode,

    #[msg("Invalid replay window size")]
    InvalidReplayWindowSize,

    #[msg("Invalid DH group")]
    InvalidDHGroup,
}
