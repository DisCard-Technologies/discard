//! Update an existing merchant's status or risk tier

use anchor_lang::prelude::*;
use crate::state::{MerchantRecord, MerchantRegistryConfig, MAX_METADATA_URI_LEN};
use crate::errors::MerchantRegistryError;

#[derive(Accounts)]
pub struct UpdateMerchant<'info> {
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

pub fn handler(
    ctx: Context<UpdateMerchant>,
    risk_tier: Option<u8>,
    is_active: Option<bool>,
    metadata_uri: Option<String>,
) -> Result<()> {
    let merchant = &mut ctx.accounts.merchant;
    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    let old_risk_tier = merchant.risk_tier;
    let old_is_active = merchant.is_active;

    // Update risk tier if provided
    if let Some(tier) = risk_tier {
        require!(
            tier >= 1 && tier <= 4,
            MerchantRegistryError::InvalidRiskTier
        );

        // Update blocked count if transitioning to/from blocked
        if tier == 4 && old_risk_tier != 4 {
            config.blocked_count = config.blocked_count.checked_add(1).unwrap();
        } else if tier != 4 && old_risk_tier == 4 {
            config.blocked_count = config.blocked_count.checked_sub(1).unwrap();
        }

        merchant.risk_tier = tier;
    }

    // Update active status if provided
    if let Some(active) = is_active {
        merchant.is_active = active;
    }

    // Update metadata URI if provided
    if let Some(uri) = metadata_uri {
        require!(
            uri.len() <= MAX_METADATA_URI_LEN,
            MerchantRegistryError::MetadataUriTooLong
        );
        merchant.metadata_uri = Some(uri);
    }

    merchant.updated_at = clock.unix_timestamp;
    config.last_updated = clock.unix_timestamp;

    msg!(
        "Updated merchant: {} (active: {} -> {}, risk: {} -> {})",
        merchant.merchant_name,
        old_is_active,
        merchant.is_active,
        old_risk_tier,
        merchant.risk_tier
    );

    Ok(())
}
