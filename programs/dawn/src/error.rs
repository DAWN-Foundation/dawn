use anchor_lang::prelude::*;

#[error_code]
pub enum DawnError {
    #[msg("Arithmetic operation overflowed")]
    Overflow,

    #[msg("Arithmetic operation underflowed")]
    Underflow,

    #[msg("Building name is empty")]
    EmptyBuildingName,

    #[msg("Building address is empty")]
    EmptyBuildingAddress,

    #[msg("Invalid number of floors")]
    InvalidFloors,

    #[msg("Building name is too long")]
    BuildingNameTooLong,

    #[msg("Building address is too long")]
    BuildingAddressTooLong,

    #[msg("Plan price is zero")]
    ZeroPlanPrice,

    #[msg("Plan duration is zero")]
    ZeroPlanDuration,

    #[msg("Plan speed is zero")]
    ZeroPlanSpeed,

    #[msg("Plan is expired")]
    PlanExpired,

    #[msg("Insufficient funds")]
    InsufficientFunds,

    #[msg("Invalid mint")]
    InvalidMint,

    #[msg("Invalid vault")]
    InvalidVault,

    #[msg("Claim too early")]
    ClaimTooEarly,

    #[msg("Device manufacturer is empty")]
    EmptyDeviceManufacturer,
    
    #[msg("Device model is empty")]
    EmptyDeviceModel,

    #[msg("Invalid number of latitude")]
    InvalidLatitude,

    #[msg("Invalid number of longitude")]
    InvalidLongitude,

    #[msg("Device manufacturer is too long")]
    DeviceManufacturerTooLong,

    #[msg("Device model is too long")]
    DeviceModelTooLong,
}