//! Velocity reset instruction handlers

use anchor_lang::prelude::*;
use crate::{ResetDailySpending, ResetMonthlySpending};

/// Reset daily spending counters for multiple cards
pub fn reset_daily_spending(
    ctx: Context<ResetDailySpending>,
    card_ids: Vec<[u8; 32]>,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_slot = clock.slot;

    // In production:
    // 1. For each card, decompress state
    // 2. Reset daily spending counter
    // 3. Update last_reset_slot
    // 4. Recompress with new state

    msg!("Resetting daily spending for {} cards", card_ids.len());
    msg!("Current slot: {}", current_slot);

    for card_id in &card_ids {
        msg!("Resetting daily spending for card: {:?}", card_id);
        // reset_card_daily_spending(card_id, current_slot)?;
    }

    Ok(())
}

/// Reset monthly spending counters for multiple cards
pub fn reset_monthly_spending(
    ctx: Context<ResetMonthlySpending>,
    card_ids: Vec<[u8; 32]>,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_slot = clock.slot;

    // In production:
    // 1. For each card, decompress state
    // 2. Reset monthly spending counter
    // 3. Update last_reset_slot
    // 4. Recompress with new state

    msg!("Resetting monthly spending for {} cards", card_ids.len());
    msg!("Current slot: {}", current_slot);

    for card_id in &card_ids {
        msg!("Resetting monthly spending for card: {:?}", card_id);
        // reset_card_monthly_spending(card_id, current_slot)?;
    }

    Ok(())
}

/// Calculate if daily reset is needed based on slot time
pub fn should_reset_daily(last_reset_slot: u64, current_slot: u64) -> bool {
    // Assuming ~400ms slots, roughly 216000 slots per day
    const SLOTS_PER_DAY: u64 = 216_000;

    current_slot.saturating_sub(last_reset_slot) >= SLOTS_PER_DAY
}

/// Calculate if monthly reset is needed based on slot time
pub fn should_reset_monthly(last_reset_slot: u64, current_slot: u64) -> bool {
    // Assuming ~400ms slots, roughly 6480000 slots per month (30 days)
    const SLOTS_PER_MONTH: u64 = 6_480_000;

    current_slot.saturating_sub(last_reset_slot) >= SLOTS_PER_MONTH
}
