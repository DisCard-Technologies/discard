//! Initialize the merchant registry configuration

use anchor_lang::prelude::*;
use crate::state::MerchantRegistryConfig;

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + MerchantRegistryConfig::INIT_SPACE,
        seeds = [MerchantRegistryConfig::SEED],
        bump
    )]
    pub config: Account<'info, MerchantRegistryConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeRegistry>) -> Result<()> {
    let config = &mut ctx.accounts.config;

    config.authority = ctx.accounts.authority.key();
    config.total_merchants = 0;
    config.blocked_count = 0;
    config.last_updated = Clock::get()?.unix_timestamp;
    config.bump = ctx.bumps.config;

    msg!("Merchant registry initialized with authority: {}", config.authority);

    Ok(())
}
