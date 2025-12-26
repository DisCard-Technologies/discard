//! Revoke a merchant (set to blocked status)

use anchor_lang::prelude::*;
use crate::state::{MerchantRecord, MerchantRegistryConfig, risk_tier};
use crate::errors::MerchantRegistryError;

#[derive(Accounts)]
pub struct RevokeMerchant<'info> {
    #[account(
        mut,
        seeds = [MerchantRegistryConfig::SEED],
        bump = config.bump,
        constraint = config.authority == authority.key() @ MerchantRegistryError::Unauthorized
    )]
    pub config: Account<'info, MerchantRegistryConfig>,

    #[account(
        mut,
        seeds = [MerchantRecord::SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump
    )]
    pub merchant: Account<'info, MerchantRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<RevokeMerchant>) -> Result<()> {
    let merchant = &mut ctx.accounts.merchant;
    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    // Check if already blocked
    require!(
        merchant.risk_tier != risk_tier::BLOCKED,
        MerchantRegistryError::MerchantAlreadyBlocked
    );

    let old_tier = merchant.risk_tier;

    // Set to blocked
    merchant.risk_tier = risk_tier::BLOCKED;
    merchant.is_active = false;
    merchant.updated_at = clock.unix_timestamp;

    // Update blocked count
    config.blocked_count = config.blocked_count.checked_add(1).unwrap();
    config.last_updated = clock.unix_timestamp;

    msg!(
        "Revoked merchant: {} (risk: {} -> {})",
        merchant.merchant_name,
        old_tier,
        risk_tier::BLOCKED
    );

    Ok(())
}
