//! Card state for compressed PDAs

use anchor_lang::prelude::*;

/// Compressed card state stored in Light Protocol Merkle tree
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CardState {
    /// Unique card identifier (hash)
    pub card_id: [u8; 32],

    /// Owner's DID commitment (Poseidon hash)
    pub owner_did_commitment: [u8; 32],

    /// Current balance in cents
    pub balance: u64,

    /// Per-transaction spending limit in cents
    pub spending_limit: u64,

    /// Daily spending limit in cents
    pub daily_limit: u64,

    /// Monthly spending limit in cents
    pub monthly_limit: u64,

    /// Current daily spending in cents
    pub current_daily_spend: u64,

    /// Current monthly spending in cents
    pub current_monthly_spend: u64,

    /// Slot when velocity counters were last reset
    pub last_reset_slot: u64,

    /// Whether the card is frozen
    pub is_frozen: bool,

    /// Freeze reason if frozen
    pub freeze_reason: Option<FreezeReasonState>,

    /// Number of merchants in whitelist
    pub merchant_whitelist_count: u8,

    /// Number of MCC codes in whitelist
    pub mcc_whitelist_count: u8,

    /// Slot when card was created
    pub created_at_slot: u64,

    /// Slot when card was last updated
    pub updated_at_slot: u64,
}

impl CardState {
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 2 + 1 + 1 + 8 + 8;

    /// Check if a transaction can be processed
    pub fn can_process_transaction(&self, amount: u64) -> Result<()> {
        require!(!self.is_frozen, CardError::CardFrozen);
        require!(self.balance >= amount, CardError::InsufficientBalance);
        require!(amount <= self.spending_limit, CardError::ExceedsSpendingLimit);
        require!(
            self.current_daily_spend.checked_add(amount).unwrap_or(u64::MAX) <= self.daily_limit,
            CardError::ExceedsDailyLimit
        );
        require!(
            self.current_monthly_spend.checked_add(amount).unwrap_or(u64::MAX) <= self.monthly_limit,
            CardError::ExceedsMonthlyLimit
        );
        Ok(())
    }

    /// Apply a spending transaction
    pub fn apply_spending(&mut self, amount: u64) -> Result<()> {
        self.can_process_transaction(amount)?;
        self.balance = self.balance.checked_sub(amount).ok_or(CardError::InsufficientBalance)?;
        self.current_daily_spend = self.current_daily_spend.checked_add(amount).unwrap_or(u64::MAX);
        self.current_monthly_spend = self.current_monthly_spend.checked_add(amount).unwrap_or(u64::MAX);
        Ok(())
    }

    /// Add funds to the card
    pub fn add_funds(&mut self, amount: u64) -> Result<()> {
        self.balance = self.balance.checked_add(amount).ok_or(CardError::Overflow)?;
        Ok(())
    }

    /// Freeze the card
    pub fn freeze(&mut self, reason: FreezeReasonState) {
        self.is_frozen = true;
        self.freeze_reason = Some(reason);
    }

    /// Unfreeze the card
    pub fn unfreeze(&mut self) {
        self.is_frozen = false;
        self.freeze_reason = None;
    }

    /// Reset daily spending counter
    pub fn reset_daily(&mut self, current_slot: u64) {
        self.current_daily_spend = 0;
        self.last_reset_slot = current_slot;
    }

    /// Reset monthly spending counter
    pub fn reset_monthly(&mut self, current_slot: u64) {
        self.current_monthly_spend = 0;
        self.last_reset_slot = current_slot;
    }
}

/// Freeze reason stored in state
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum FreezeReasonState {
    FraudDetected,
    UserRequest,
    ComplianceHold,
    VelocityBreach,
    MerchantBlock,
}

/// Card-specific errors
#[error_code]
pub enum CardError {
    #[msg("Card is frozen")]
    CardFrozen,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Transaction exceeds per-transaction spending limit")]
    ExceedsSpendingLimit,

    #[msg("Transaction would exceed daily spending limit")]
    ExceedsDailyLimit,

    #[msg("Transaction would exceed monthly spending limit")]
    ExceedsMonthlyLimit,

    #[msg("Merchant not in whitelist")]
    MerchantNotWhitelisted,

    #[msg("Merchant category not allowed")]
    MccNotAllowed,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Card not found")]
    CardNotFound,

    #[msg("Invalid card state")]
    InvalidCardState,
}

/// Merchant whitelist entry (stored separately)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MerchantWhitelistEntry {
    pub card_id: [u8; 32],
    pub merchant_id: [u8; 32],
    pub added_at_slot: u64,
}

/// MCC whitelist entry (stored separately)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MccWhitelistEntry {
    pub card_id: [u8; 32],
    pub mcc_code: u16,
    pub added_at_slot: u64,
}
