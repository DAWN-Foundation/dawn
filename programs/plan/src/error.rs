use anchor_lang::prelude::*;

#[error_code]
pub enum PlanError {
    #[msg("Arithmetic operation overflowed")]
    Overflow,

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
}
