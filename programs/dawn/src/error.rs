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

    #[msg("Auth method not assigned to plan")]
    AuthMethodNotInPlan,

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

    #[msg("Too many blocks for bitmap representation")]
    TooManyBlocks,

    #[msg("Invalid block index")]
    InvalidBlockIndex,

    #[msg("Invalid root block index")]
    InvalidRootIndex,

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

    // IPv4 OVERFLOW ERRORS
    #[msg("IPv4 calculation would overflow u32::MAX")]
    IPv4Overflow,

    #[msg("IPv4 range exceeds maximum addressable space")]
    IPv4RangeExceedsMax,

    #[msg("IPv4 address not aligned to network boundary")]
    IPv4NotAligned,

    #[msg("Invalid CIDR prefix length")]
    InvalidCidr,

    // CONFIG ERRORS
    #[msg("Fee BPS exceeds maximum (10,000)")]
    InvalidFeeBps,

    #[msg("Total fees exceed 100% (10,000 BPS)")]
    TotalFeesExceedMax,

    #[msg("Invalid Raydium program ID")]
    InvalidRaydiumProgram,

    #[msg("Invalid Raydium pool owner")]
    InvalidRaydiumPoolOwner,

    // MEV PROTECTION ERRORS
    #[msg("Transaction deadline has expired")]
    TransactionExpired,

    #[msg("Insufficient output amount from swap")]
    InsufficientOutputAmount,

    #[msg("Invalid minimum output amount")]
    InvalidMinimumOutput,

    #[msg("Deadline is too far in the future")]
    DeadlineTooFarInFuture,

    #[msg("Invalid amount: cannot be zero")]
    InvalidAmount,

    #[msg("Invalid UTF-8 in seed data")]
    InvalidUtf8InSeed,

    // SUBSCRIPTION PAYMENT ERRORS
    #[msg("Daily swap amount too small - plan price minus fees must be >= duration")]
    DailySwapTooSmall,

    #[msg("Invalid beneficiary")]
    InvalidBeneficiary,

    // ACCESS DOMAIN REDESIGN — added with the integration of the lean
    // access-domain schema. These codes are stable; do not reuse a slot.

    #[msg("Access domain name is empty")]
    EmptyAccessDomainName,

    #[msg("Access domain name is too long")]
    AccessDomainNameTooLong,

    #[msg("Invalid control plane device (cannot be default Pubkey)")]
    InvalidControlPlaneDevice,

    #[msg("Only the access-domain owner may perform this action")]
    OnlyAccessDomainOwner,

    #[msg("AuthMethod's access_domain does not match the provided AccessDomain")]
    AuthMethodAccessDomainMismatch,

    #[msg("Credential's access_domain does not match the provided AccessDomain")]
    CredentialAccessDomainMismatch,

    #[msg("Credential's auth_method does not match the provided AuthMethod")]
    CredentialAuthMethodMismatch,

    #[msg("Caller is not authorized to revoke this credential")]
    UnauthorizedCredentialRevoke,

    #[msg("Invalid VLAN id (must be in 1..=4094)")]
    InvalidVlanId,

    #[msg("update_auth_method_params: caller must be access_domain.owner OR a live ConfigPlaneManager")]
    OnlyOwnerOrConfigPlaneManager,

    // DOMAIN AUTHORITY (Tier-2 grants)

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

    // PLAN ↔ ACCESS DOMAIN linkage

    #[msg("Plan.access_domain does not match the provided AccessDomain")]
    PlanAccessDomainMismatch,

    // PSK PARAMETERS (multi-band)
    // Note: InvalidSecurityStandard and InvalidEncryptionAlgorithm
    // already exist earlier in this enum (master had them); reused here.

    #[msg("Invalid PSK rotation interval")]
    InvalidPskRotationInterval,

    #[msg("PSKMethodParams: at least one band (2.4/5/6 GHz) must be active")]
    PskNoActiveBand,

    #[msg("PSKMethodParams: SSID label length out of range")]
    InvalidSsidLabelLen,

    #[msg("PSKMethodParams: SSID label is not valid utf-8 in its declared prefix")]
    InvalidSsidUtf8,

    // AUTHENTICATOR (Access Point on an AccessDomain)
    #[msg("Invalid authenticator pubkey (cannot be default Pubkey)")]
    InvalidAuthenticatorPubkey,

    #[msg("Invalid authenticator MAC address (cannot be all zeros)")]
    InvalidAuthenticatorMac,

    #[msg("Authenticator label too long (max 32 chars)")]
    AuthenticatorLabelTooLong,

    #[msg("Authenticator expires_at is already in the past")]
    AuthenticatorAlreadyExpired,

    #[msg("Authenticator does not belong to the provided AccessDomain")]
    AuthenticatorAccessDomainMismatch,

    #[msg("Authenticator rotation must change the pubkey")]
    AuthenticatorRotationNoOp,
    // (InvalidUtf8InSeed already defined earlier in this enum — reused.)
}
