use anchor_lang::prelude::*;

declare_id!("79d7dzfG5hC2xCzNUrwyAdG2agBh6NM9gATyXPBr9zFq");

mod instructions;
use instructions::*;

#[program]
pub mod plan {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        PlanApp::initialize(ctx)
    }
}
