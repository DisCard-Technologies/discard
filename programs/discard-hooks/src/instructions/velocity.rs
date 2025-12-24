//! DisCard 2035 - Velocity Limit Instructions

use anchor_lang::prelude::*;
use crate::{
    UpdateVelocityLimits, RecordTransaction, ResetVelocity,
    state::VelocityLimits,
};

// Slot timing constants (assuming ~400ms slots)
const SLOTS_PER_DAY: u64 = 216_000;
const SLOTS_PER_WEEK: u64 = 1_512_000;
const SLOTS_PER_MONTH: u64 = 6_480_000;

/// Update velocity limits for a card
pub fn update_limits(
    ctx: Context<UpdateVelocityLimits>,
    limits: VelocityLimits,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Updating velocity limits:");
    msg!("  Per transaction: {}", limits.per_transaction);
    msg!("  Daily: {}", limits.daily);
    msg!("  Weekly: {}", limits.weekly);
    msg!("  Monthly: {}", limits.monthly);

    card_config.velocity_limits = limits;
    card_config.updated_at = clock.unix_timestamp;

    msg!("Velocity limits updated successfully");

    Ok(())
}

/// Record a transaction for velocity tracking
pub fn record_transaction(
    ctx: Context<RecordTransaction>,
    amount: u64,
    merchant_id: Option<[u8; 32]>,
    mcc_code: Option<u16>,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Recording transaction:");
    msg!("  Amount: {}", amount);
    if let Some(mid) = merchant_id {
        msg!("  Merchant: {:?}", mid);
    }
    if let Some(mcc) = mcc_code {
        msg!("  MCC: {}", mcc);
    }

    // Check if resets are needed based on slot time
    auto_reset_if_needed(card_config, clock.slot)?;

    // Record the transaction
    card_config.velocity_counters.record_transaction(amount);
    card_config.last_transaction_at = Some(clock.unix_timestamp);
    card_config.updated_at = clock.unix_timestamp;

    msg!("Transaction recorded. Daily total: {}", card_config.velocity_counters.daily_total);

    Ok(())
}

/// Reset daily velocity counters
pub fn reset_daily(ctx: Context<ResetVelocity>) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Resetting daily velocity counters");
    msg!("  Previous daily total: {}", card_config.velocity_counters.daily_total);

    card_config.velocity_counters.reset_daily(clock.slot);
    card_config.updated_at = clock.unix_timestamp;

    msg!("Daily velocity counters reset");

    Ok(())
}

/// Reset weekly velocity counters
pub fn reset_weekly(ctx: Context<ResetVelocity>) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Resetting weekly velocity counters");
    msg!("  Previous weekly total: {}", card_config.velocity_counters.weekly_total);

    card_config.velocity_counters.reset_weekly(clock.slot);
    card_config.updated_at = clock.unix_timestamp;

    msg!("Weekly velocity counters reset");

    Ok(())
}

/// Reset monthly velocity counters
pub fn reset_monthly(ctx: Context<ResetVelocity>) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Resetting monthly velocity counters");
    msg!("  Previous monthly total: {}", card_config.velocity_counters.monthly_total);

    card_config.velocity_counters.reset_monthly(clock.slot);
    card_config.updated_at = clock.unix_timestamp;

    msg!("Monthly velocity counters reset");

    Ok(())
}

/// Automatically reset counters if enough time has passed
fn auto_reset_if_needed(
    card_config: &mut crate::state::CardConfig,
    current_slot: u64,
) -> Result<()> {
    let counters = &mut card_config.velocity_counters;

    // Check and reset daily
    if current_slot.saturating_sub(counters.last_daily_reset_slot) >= SLOTS_PER_DAY {
        msg!("Auto-resetting daily counters");
        counters.reset_daily(current_slot);
    }

    // Check and reset weekly
    if current_slot.saturating_sub(counters.last_weekly_reset_slot) >= SLOTS_PER_WEEK {
        msg!("Auto-resetting weekly counters");
        counters.reset_weekly(current_slot);
    }

    // Check and reset monthly
    if current_slot.saturating_sub(counters.last_monthly_reset_slot) >= SLOTS_PER_MONTH {
        msg!("Auto-resetting monthly counters");
        counters.reset_monthly(current_slot);
    }

    Ok(())
}

// ============================================================================
// Velocity Limit Presets
// ============================================================================

/// Conservative limits for low-risk users
pub fn conservative_limits() -> VelocityLimits {
    VelocityLimits {
        per_transaction: 50000,      // $500
        daily: 100000,               // $1,000
        weekly: 250000,              // $2,500
        monthly: 500000,             // $5,000
        max_daily_transactions: 10,
        max_weekly_transactions: 30,
        max_monthly_transactions: 100,
    }
}

/// Standard limits for verified users
pub fn standard_limits() -> VelocityLimits {
    VelocityLimits {
        per_transaction: 250000,     // $2,500
        daily: 500000,               // $5,000
        weekly: 1500000,             // $15,000
        monthly: 5000000,            // $50,000
        max_daily_transactions: 25,
        max_weekly_transactions: 100,
        max_monthly_transactions: 300,
    }
}

/// Premium limits for fully verified users
pub fn premium_limits() -> VelocityLimits {
    VelocityLimits {
        per_transaction: 1000000,    // $10,000
        daily: 2500000,              // $25,000
        weekly: 10000000,            // $100,000
        monthly: 25000000,           // $250,000
        max_daily_transactions: 50,
        max_weekly_transactions: 200,
        max_monthly_transactions: 500,
    }
}

/// Institutional limits for business accounts
pub fn institutional_limits() -> VelocityLimits {
    VelocityLimits {
        per_transaction: 10000000,   // $100,000
        daily: 50000000,             // $500,000
        weekly: 200000000,           // $2,000,000
        monthly: 500000000,          // $5,000,000
        max_daily_transactions: 500,
        max_weekly_transactions: 2000,
        max_monthly_transactions: 10000,
    }
}
