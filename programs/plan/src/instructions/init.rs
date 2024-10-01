use anchor_lang::prelude::*;

use super::PlanApp;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
}

impl PlanApp {
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!(
            "Initializing the PlanApp program by {}",
            ctx.accounts.caller.key()
        );
        Ok(())
    }
}
