use anchor_lang::prelude::*;

#[error_code]
pub enum PlanError {
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
}
