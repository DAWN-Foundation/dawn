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

    #[msg("Device not in local domain")]
    DeviceNotInLocalDomain,

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

    // PLAN DOMAIN CONSTRAINTS
    #[msg("Distribution domain can only be created for original plans")]
    DistributionDomainForL3PlansOnly,

    #[msg("Access domain can only be created for derived plans")]
    AccessDomainForL2PlansOnly,

    #[msg("Device type is invalid")]
    InvalidDeviceType,

    #[msg("Distribution domain is required")]
    DistributionDomainRequired,

    #[msg("Invalid auth method account")]
    InvalidAuthMethodAccount,

    #[msg("Invalid auth method authority")]
    InvalidAuthMethodAuthority,

    // IPAM errors
    #[msg("Invalid tier specified")]
    InvalidTier,

    #[msg("Invalid unit index")]
    InvalidUnitIndex,

    #[msg("IP allocation capacity exhausted")]
    CapacityExhausted,

    #[msg("IP block not found")]
    IpBlockNotFound,

    #[msg("IP lease not found")]
    IpLeaseNotFound,

    #[msg("IP lease expired")]
    IpLeaseExpired,

    #[msg("Device is required for this operation")]
    DeviceRequired,

    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    #[msg("Subscription expired")]
    SubscriptionExpired,

    #[msg("IP lease not expired")]
    IpLeaseNotExpired,

    #[msg("No available blocks")]
    NoAvailableBlocks,

    #[msg("Block account is missing")]
    BlockAccountIsMissing,

    #[msg("Invalid device")]
    InvalidDevice,

    // Registry errors
    #[msg("Invalid sequence number")]
    InvalidSequence,

    #[msg("Registry not found")]
    RegistryNotFound,

    #[msg("All tiers exhausted")]
    AllTiersExhausted,

    #[msg("Root block already exists")]
    RootBlockAlreadyExists,

    #[msg("Maximum root blocks reached")]
    MaxRootBlocksReached,

    #[msg("Sequence out of bounds")]
    SequenceOutOfBounds,
}
