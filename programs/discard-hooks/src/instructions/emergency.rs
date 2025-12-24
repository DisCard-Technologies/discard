//! DisCard 2035 - Emergency Control Instructions

use anchor_lang::prelude::*;
use crate::{
    EmergencyControl, GlobalControl,
    state::{CardStatus, FreezeInfo, FreezeReason},
    errors::HookError,
};

/// Emergency freeze a card
pub fn freeze(ctx: Context<EmergencyControl>, reason: FreezeReason) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let global_config = &ctx.accounts.global_config;
    let clock = Clock::get()?;

    // Verify authority
    let is_owner = card_config.owner_did_hash == ctx.accounts.authority.key().to_bytes();
    let is_fraud_authority = global_config.is_authorized_fraud_authority(ctx.accounts.authority.key());

    if !is_owner && !is_fraud_authority {
        return Err(error!(HookError::Unauthorized));
    }

    msg!("Emergency freeze initiated:");
    msg!("  Card: {:?}", card_config.card_id);
    msg!("  Reason: {:?}", reason);
    msg!("  By: {}", ctx.accounts.authority.key());

    // Set freeze info
    card_config.freeze_info = Some(FreezeInfo {
        reason,
        frozen_by: ctx.accounts.authority.key(),
        frozen_at: clock.unix_timestamp,
        expires_at: None, // No auto-unfreeze
    });

    card_config.status = CardStatus::Frozen;
    card_config.updated_at = clock.unix_timestamp;

    msg!("Card frozen successfully");

    Ok(())
}

/// Unfreeze a card after review
pub fn unfreeze(ctx: Context<EmergencyControl>) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let global_config = &ctx.accounts.global_config;
    let clock = Clock::get()?;

    // Verify authority
    let is_owner = card_config.owner_did_hash == ctx.accounts.authority.key().to_bytes();
    let is_fraud_authority = global_config.is_authorized_fraud_authority(ctx.accounts.authority.key());

    if !is_owner && !is_fraud_authority {
        return Err(error!(HookError::Unauthorized));
    }

    // Check if card is actually frozen
    if card_config.freeze_info.is_none() {
        msg!("Card is not frozen");
        return Ok(());
    }

    msg!("Unfreezing card:");
    msg!("  Card: {:?}", card_config.card_id);
    msg!("  By: {}", ctx.accounts.authority.key());

    // Clear freeze info
    card_config.freeze_info = None;
    card_config.status = CardStatus::Active;
    card_config.updated_at = clock.unix_timestamp;

    msg!("Card unfrozen successfully");

    Ok(())
}

/// Global emergency pause
pub fn global_pause(ctx: Context<GlobalControl>) -> Result<()> {
    let global_config = &mut ctx.accounts.global_config;
    let clock = Clock::get()?;

    msg!("GLOBAL PAUSE initiated by admin: {}", ctx.accounts.admin.key());

    global_config.is_paused = true;
    global_config.updated_at = clock.unix_timestamp;

    msg!("Program globally paused - all transfers will be rejected");

    Ok(())
}

/// Resume from global pause
pub fn global_resume(ctx: Context<GlobalControl>) -> Result<()> {
    let global_config = &mut ctx.accounts.global_config;
    let clock = Clock::get()?;

    msg!("GLOBAL RESUME initiated by admin: {}", ctx.accounts.admin.key());

    global_config.is_paused = false;
    global_config.updated_at = clock.unix_timestamp;

    msg!("Program resumed - transfers will proceed normally");

    Ok(())
}

// ============================================================================
// Freeze Reason Descriptions
// ============================================================================

impl FreezeReason {
    /// Get human-readable description
    pub fn description(&self) -> &'static str {
        match self {
            FreezeReason::FraudDetected => "Fraudulent activity detected",
            FreezeReason::UserRequest => "User-requested freeze",
            FreezeReason::AdminAction => "Administrative action",
            FreezeReason::VelocityBreach => "Velocity limit breach detected",
            FreezeReason::SuspiciousActivity => "Suspicious activity patterns",
            FreezeReason::LostOrStolen => "Card reported lost or stolen",
            FreezeReason::ComplianceHold => "Compliance review in progress",
        }
    }

    /// Check if freeze requires admin review to unfreeze
    pub fn requires_admin_review(&self) -> bool {
        match self {
            FreezeReason::FraudDetected => true,
            FreezeReason::AdminAction => true,
            FreezeReason::ComplianceHold => true,
            _ => false,
        }
    }

    /// Check if user can self-unfreeze
    pub fn user_can_unfreeze(&self) -> bool {
        match self {
            FreezeReason::UserRequest => true,
            FreezeReason::VelocityBreach => true,
            FreezeReason::SuspiciousActivity => false,
            _ => false,
        }
    }
}
