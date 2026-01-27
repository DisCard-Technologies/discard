//! DisCard 2035 - Transfer Hook Errors

use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    // ========================================================================
    // Authorization Errors (6000-6099)
    // ========================================================================

    #[msg("Unauthorized: caller is not permitted to perform this action")]
    Unauthorized,

    #[msg("Invalid DID commitment: ownership verification failed")]
    InvalidDidCommitment,

    #[msg("Expired session: re-authentication required")]
    SessionExpired,

    // ========================================================================
    // Card Status Errors (6100-6199)
    // ========================================================================

    #[msg("Card is not active")]
    CardNotActive,

    #[msg("Card is frozen")]
    CardFrozen,

    #[msg("Card is terminated")]
    CardTerminated,

    #[msg("Card is pending activation")]
    CardPending,

    // ========================================================================
    // Merchant Errors (6200-6299)
    // ========================================================================

    #[msg("Merchant is not in whitelist")]
    MerchantNotWhitelisted,

    #[msg("Merchant is blocked")]
    MerchantBlocked,

    #[msg("Unknown merchant: transaction requires known merchant ID")]
    UnknownMerchant,

    #[msg("Merchant whitelist is full")]
    MerchantWhitelistFull,

    #[msg("Merchant blocklist is full")]
    MerchantBlocklistFull,

    // ========================================================================
    // MCC (Merchant Category Code) Errors (6300-6399)
    // ========================================================================

    #[msg("MCC code is not in whitelist")]
    MccNotWhitelisted,

    #[msg("MCC code is blocked")]
    MccBlocked,

    #[msg("Invalid MCC code")]
    InvalidMccCode,

    #[msg("MCC whitelist is full")]
    MccWhitelistFull,

    #[msg("MCC blocklist is full")]
    MccBlocklistFull,

    // ========================================================================
    // Velocity Limit Errors (6400-6499)
    // ========================================================================

    #[msg("Transaction limit exceeded")]
    TransactionLimitExceeded,

    #[msg("Daily spending limit exceeded")]
    DailyLimitExceeded,

    #[msg("Weekly spending limit exceeded")]
    WeeklyLimitExceeded,

    #[msg("Monthly spending limit exceeded")]
    MonthlyLimitExceeded,

    #[msg("Daily transaction count limit exceeded")]
    DailyTransactionCountExceeded,

    #[msg("Weekly transaction count limit exceeded")]
    WeeklyTransactionCountExceeded,

    #[msg("Monthly transaction count limit exceeded")]
    MonthlyTransactionCountExceeded,

    // ========================================================================
    // Policy Errors (6500-6599)
    // ========================================================================

    #[msg("International transactions not allowed")]
    InternationalNotAllowed,

    #[msg("Online transactions not allowed")]
    OnlineNotAllowed,

    #[msg("ATM withdrawals not allowed")]
    AtmNotAllowed,

    #[msg("Contactless transactions not allowed")]
    ContactlessNotAllowed,

    #[msg("Contactless limit exceeded: PIN required")]
    ContactlessLimitExceeded,

    #[msg("Country not allowed")]
    CountryNotAllowed,

    #[msg("Country is blocked")]
    CountryBlocked,

    // ========================================================================
    // Verification Errors (6600-6699)
    // ========================================================================

    #[msg("Biometric verification required")]
    BiometricRequired,

    #[msg("Two-factor authentication required")]
    TwoFactorRequired,

    #[msg("Step-up authentication required for this transaction")]
    StepUpAuthRequired,

    // ========================================================================
    // Global/System Errors (6700-6799)
    // ========================================================================

    #[msg("Program is globally paused")]
    GloballyPaused,

    #[msg("Invalid configuration")]
    InvalidConfiguration,

    #[msg("Account already exists")]
    AccountAlreadyExists,

    #[msg("Account not found")]
    AccountNotFound,

    #[msg("Invalid slot: operation timing error")]
    InvalidSlot,

    // ========================================================================
    // Arithmetic Errors (6800-6899)
    // ========================================================================

    #[msg("Overflow in arithmetic operation")]
    Overflow,

    #[msg("Underflow in arithmetic operation")]
    Underflow,

    #[msg("Division by zero")]
    DivisionByZero,

    // ========================================================================
    // Confidential Transfer Errors (6900-6999)
    // ========================================================================

    #[msg("Confidential mode not enabled for this card")]
    ConfidentialModeNotEnabled,

    #[msg("Invalid ZK proof data")]
    InvalidProofData,

    #[msg("Velocity range proof verification failed")]
    VelocityProofFailed,

    #[msg("Encrypted velocity counter overflow")]
    EncryptedCounterOverflow,
}
