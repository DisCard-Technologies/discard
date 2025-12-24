//! DisCard 2035 - Card Configuration Instructions

use anchor_lang::prelude::*;
use crate::{
    InitializeCardConfig, UpdateCardPolicy,
    state::{CardConfig, CardStatus, CardPolicy, VelocityLimits, VelocityCounters},
};

/// Initialize a new card configuration
pub fn initialize_card_config(
    ctx: Context<InitializeCardConfig>,
    card_id: [u8; 32],
    owner_did_hash: [u8; 32],
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Initializing card config:");
    msg!("  Card ID: {:?}", card_id);
    msg!("  Owner DID Hash: {:?}", owner_did_hash);

    card_config.bump = ctx.bumps.card_config;
    card_config.card_id = card_id;
    card_config.owner_did_hash = owner_did_hash;
    card_config.status = CardStatus::Active;

    // Default policy
    card_config.policy = CardPolicy {
        require_biometric: false,
        require_2fa_above: None,
        allow_international: true,
        allow_online: true,
        allow_atm: true,
        allow_contactless: true,
        contactless_limit: 10000, // $100 in cents
        allowed_countries: vec![],
        blocked_countries: vec![],
    };

    // Default velocity limits (generous defaults)
    card_config.velocity_limits = VelocityLimits {
        per_transaction: 100000000,  // $1M per transaction
        daily: 500000000,            // $5M daily
        weekly: 2000000000,          // $20M weekly
        monthly: 10000000000,        // $100M monthly
        max_daily_transactions: 1000,
        max_weekly_transactions: 5000,
        max_monthly_transactions: 20000,
    };

    // Initialize counters
    card_config.velocity_counters = VelocityCounters {
        daily_total: 0,
        weekly_total: 0,
        monthly_total: 0,
        daily_transaction_count: 0,
        weekly_transaction_count: 0,
        monthly_transaction_count: 0,
        last_daily_reset_slot: clock.slot,
        last_weekly_reset_slot: clock.slot,
        last_monthly_reset_slot: clock.slot,
    };

    // Empty lists
    card_config.merchant_whitelist_enabled = false;
    card_config.merchant_whitelist = vec![];
    card_config.merchant_blocklist = vec![];
    card_config.mcc_whitelist_enabled = false;
    card_config.mcc_whitelist = vec![];
    card_config.mcc_blocklist = vec![];

    // No freeze
    card_config.freeze_info = None;

    // Timestamps
    card_config.created_at = clock.unix_timestamp;
    card_config.updated_at = clock.unix_timestamp;
    card_config.last_transaction_at = None;

    msg!("Card config initialized successfully");

    Ok(())
}

/// Update card policy settings
pub fn update_card_policy(
    ctx: Context<UpdateCardPolicy>,
    new_policy: CardPolicy,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Updating card policy:");
    msg!("  Require biometric: {}", new_policy.require_biometric);
    msg!("  Allow international: {}", new_policy.allow_international);
    msg!("  Allow online: {}", new_policy.allow_online);

    card_config.policy = new_policy;
    card_config.updated_at = clock.unix_timestamp;

    msg!("Card policy updated successfully");

    Ok(())
}
