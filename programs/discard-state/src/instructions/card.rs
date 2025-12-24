//! Card instruction handlers

use anchor_lang::prelude::*;
use crate::state::card::{CardState, FreezeReasonState, CardError};
use crate::{
    CreateCompressedCard, UpdateCardBalance, RecordSpending,
    FreezeCard, UnfreezeCard, UpdateCardLimits,
    CompressedProof, FreezeReason,
};

/// Create a new compressed card state
pub fn create_compressed_card(
    ctx: Context<CreateCompressedCard>,
    card_id: [u8; 32],
    owner_did_commitment: [u8; 32],
    spending_limit: u64,
    daily_limit: u64,
    monthly_limit: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_slot = clock.slot;

    // Create initial card state
    let card_state = CardState {
        card_id,
        owner_did_commitment,
        balance: 0,
        spending_limit,
        daily_limit,
        monthly_limit,
        current_daily_spend: 0,
        current_monthly_spend: 0,
        last_reset_slot: current_slot,
        is_frozen: false,
        freeze_reason: None,
        merchant_whitelist_count: 0,
        mcc_whitelist_count: 0,
        created_at_slot: current_slot,
        updated_at_slot: current_slot,
    };

    // Serialize state
    let state_bytes = card_state.try_to_vec()?;

    // In production, call Light Protocol to create compressed account
    // light_sdk::compress_account(ctx.accounts.light_system_program, state_bytes, ...)?;

    msg!("Created compressed card: {:?}", card_id);
    msg!("Spending limit: {}", spending_limit);
    msg!("Daily limit: {}", daily_limit);
    msg!("Monthly limit: {}", monthly_limit);

    Ok(())
}

/// Update card balance
pub fn update_card_balance(
    ctx: Context<UpdateCardBalance>,
    card_id: [u8; 32],
    new_balance: u64,
    proof: CompressedProof,
) -> Result<()> {
    let clock = Clock::get()?;

    // In production:
    // 1. Verify the proof
    // 2. Decompress current state
    // 3. Update balance
    // 4. Recompress with new state

    msg!("Updated card balance: {:?} -> {}", card_id, new_balance);

    Ok(())
}

/// Record spending transaction
pub fn record_spending(
    ctx: Context<RecordSpending>,
    card_id: [u8; 32],
    spend_amount: u64,
    merchant_id: Option<[u8; 32]>,
    mcc_code: Option<u16>,
    proof: CompressedProof,
) -> Result<()> {
    let clock = Clock::get()?;

    // In production:
    // 1. Verify the proof
    // 2. Decompress current state
    // 3. Check if transaction is allowed (limits, merchant, MCC)
    // 4. Apply spending
    // 5. Recompress with new state

    msg!("Recorded spending: {:?} amount={}", card_id, spend_amount);
    if let Some(mid) = merchant_id {
        msg!("Merchant: {:?}", mid);
    }
    if let Some(mcc) = mcc_code {
        msg!("MCC: {}", mcc);
    }

    Ok(())
}

/// Freeze a card
pub fn freeze_card(
    ctx: Context<FreezeCard>,
    card_id: [u8; 32],
    reason: FreezeReason,
    proof: CompressedProof,
) -> Result<()> {
    let freeze_reason = match reason {
        FreezeReason::FraudDetected => FreezeReasonState::FraudDetected,
        FreezeReason::UserRequest => FreezeReasonState::UserRequest,
        FreezeReason::ComplianceHold => FreezeReasonState::ComplianceHold,
        FreezeReason::VelocityBreach => FreezeReasonState::VelocityBreach,
        FreezeReason::MerchantBlock => FreezeReasonState::MerchantBlock,
    };

    // In production:
    // 1. Verify the proof
    // 2. Decompress current state
    // 3. Apply freeze
    // 4. Recompress with new state

    msg!("Frozen card: {:?} reason={:?}", card_id, freeze_reason);

    Ok(())
}

/// Unfreeze a card
pub fn unfreeze_card(
    ctx: Context<UnfreezeCard>,
    card_id: [u8; 32],
    proof: CompressedProof,
) -> Result<()> {
    // In production:
    // 1. Verify the proof
    // 2. Decompress current state
    // 3. Apply unfreeze
    // 4. Recompress with new state

    msg!("Unfrozen card: {:?}", card_id);

    Ok(())
}

/// Update card spending limits
pub fn update_card_limits(
    ctx: Context<UpdateCardLimits>,
    card_id: [u8; 32],
    new_spending_limit: Option<u64>,
    new_daily_limit: Option<u64>,
    new_monthly_limit: Option<u64>,
    proof: CompressedProof,
) -> Result<()> {
    // In production:
    // 1. Verify the proof
    // 2. Decompress current state
    // 3. Apply limit updates
    // 4. Recompress with new state

    msg!("Updated card limits: {:?}", card_id);
    if let Some(limit) = new_spending_limit {
        msg!("New spending limit: {}", limit);
    }
    if let Some(limit) = new_daily_limit {
        msg!("New daily limit: {}", limit);
    }
    if let Some(limit) = new_monthly_limit {
        msg!("New monthly limit: {}", limit);
    }

    Ok(())
}
