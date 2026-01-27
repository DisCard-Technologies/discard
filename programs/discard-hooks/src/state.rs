//! DisCard 2035 - Transfer Hook State Accounts

use anchor_lang::prelude::*;

/// Maximum number of merchants in whitelist/blocklist
pub const MAX_MERCHANTS: usize = 50;
/// Maximum number of MCC codes in whitelist/blocklist
pub const MAX_MCC_CODES: usize = 100;

// ============================================================================
// Card Configuration (Per-Card State)
// ============================================================================

#[account]
#[derive(Default)]
pub struct CardConfig {
    /// PDA bump seed
    pub bump: u8,

    /// Card identifier (matches Convex card ID hash)
    pub card_id: [u8; 32],

    /// Owner DID commitment hash (for ownership verification)
    pub owner_did_hash: [u8; 32],

    /// Card status
    pub status: CardStatus,

    /// Policy settings
    pub policy: CardPolicy,

    /// Velocity limits
    pub velocity_limits: VelocityLimits,

    /// Current velocity counters
    pub velocity_counters: VelocityCounters,

    /// Merchant whitelist (if enabled)
    pub merchant_whitelist_enabled: bool,
    pub merchant_whitelist: Vec<[u8; 32]>,

    /// Merchant blocklist
    pub merchant_blocklist: Vec<[u8; 32]>,

    /// MCC whitelist (if enabled)
    pub mcc_whitelist_enabled: bool,
    pub mcc_whitelist: Vec<u16>,

    /// MCC blocklist
    pub mcc_blocklist: Vec<u16>,

    /// Freeze information
    pub freeze_info: Option<FreezeInfo>,

    /// Confidential transfer mode
    /// When true, velocity enforcement uses ZK proofs instead of plaintext amounts
    pub confidential_mode: bool,

    /// Encrypted velocity counters (ElGamal ciphertexts)
    /// Used when confidential_mode is true. Each is a 64-byte compressed Ristretto point pair.
    pub encrypted_daily_total: Option<[u8; 64]>,
    pub encrypted_weekly_total: Option<[u8; 64]>,
    pub encrypted_monthly_total: Option<[u8; 64]>,

    /// Timestamps
    pub created_at: i64,
    pub updated_at: i64,
    pub last_transaction_at: Option<i64>,
}

impl CardConfig {
    /// Account size calculation
    pub const SIZE: usize = 8 + // discriminator
        1 + // bump
        32 + // card_id
        32 + // owner_did_hash
        1 + // status
        CardPolicy::SIZE +
        VelocityLimits::SIZE +
        VelocityCounters::SIZE +
        1 + // merchant_whitelist_enabled
        4 + (32 * MAX_MERCHANTS) + // merchant_whitelist vec
        4 + (32 * MAX_MERCHANTS) + // merchant_blocklist vec
        1 + // mcc_whitelist_enabled
        4 + (2 * MAX_MCC_CODES) + // mcc_whitelist vec
        4 + (2 * MAX_MCC_CODES) + // mcc_blocklist vec
        1 + FreezeInfo::SIZE + // freeze_info option
        1 + // confidential_mode
        1 + 64 + // encrypted_daily_total option
        1 + 64 + // encrypted_weekly_total option
        1 + 64 + // encrypted_monthly_total option
        8 + // created_at
        8 + // updated_at
        9; // last_transaction_at option

    /// Check if a transaction is allowed
    pub fn is_transaction_allowed(
        &self,
        amount: u64,
        merchant_id: Option<[u8; 32]>,
        mcc_code: Option<u16>,
    ) -> Result<()> {
        // Check card status
        if self.status != CardStatus::Active {
            return Err(error!(crate::errors::HookError::CardNotActive));
        }

        // Check if frozen
        if self.freeze_info.is_some() {
            return Err(error!(crate::errors::HookError::CardFrozen));
        }

        // Check merchant whitelist
        if self.merchant_whitelist_enabled {
            if let Some(mid) = merchant_id {
                if !self.merchant_whitelist.contains(&mid) {
                    return Err(error!(crate::errors::HookError::MerchantNotWhitelisted));
                }
            }
        }

        // Check merchant blocklist
        if let Some(mid) = merchant_id {
            if self.merchant_blocklist.contains(&mid) {
                return Err(error!(crate::errors::HookError::MerchantBlocked));
            }
        }

        // Check MCC whitelist
        if self.mcc_whitelist_enabled {
            if let Some(mcc) = mcc_code {
                if !self.mcc_whitelist.contains(&mcc) {
                    return Err(error!(crate::errors::HookError::MccNotWhitelisted));
                }
            }
        }

        // Check MCC blocklist
        if let Some(mcc) = mcc_code {
            if self.mcc_blocklist.contains(&mcc) {
                return Err(error!(crate::errors::HookError::MccBlocked));
            }
        }

        // Check velocity limits
        self.check_velocity_limits(amount)?;

        Ok(())
    }

    /// Check velocity limits
    fn check_velocity_limits(&self, amount: u64) -> Result<()> {
        // Per-transaction limit
        if amount > self.velocity_limits.per_transaction {
            return Err(error!(crate::errors::HookError::TransactionLimitExceeded));
        }

        // Daily limit
        if self.velocity_counters.daily_total + amount > self.velocity_limits.daily {
            return Err(error!(crate::errors::HookError::DailyLimitExceeded));
        }

        // Weekly limit
        if self.velocity_counters.weekly_total + amount > self.velocity_limits.weekly {
            return Err(error!(crate::errors::HookError::WeeklyLimitExceeded));
        }

        // Monthly limit
        if self.velocity_counters.monthly_total + amount > self.velocity_limits.monthly {
            return Err(error!(crate::errors::HookError::MonthlyLimitExceeded));
        }

        Ok(())
    }
}

// ============================================================================
// Card Status
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum CardStatus {
    #[default]
    Pending,
    Active,
    Paused,
    Frozen,
    Terminated,
}

// ============================================================================
// Card Policy
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CardPolicy {
    /// Require biometric verification for transactions
    pub require_biometric: bool,

    /// Require 2FA for transactions above threshold
    pub require_2fa_above: Option<u64>,

    /// Allow international transactions
    pub allow_international: bool,

    /// Allow online transactions
    pub allow_online: bool,

    /// Allow ATM withdrawals
    pub allow_atm: bool,

    /// Allow contactless payments
    pub allow_contactless: bool,

    /// Maximum contactless amount (before PIN required)
    pub contactless_limit: u64,

    /// Geographic restrictions (country codes)
    pub allowed_countries: Vec<u16>,
    pub blocked_countries: Vec<u16>,
}

impl CardPolicy {
    pub const SIZE: usize = 1 + // require_biometric
        9 + // require_2fa_above option
        1 + // allow_international
        1 + // allow_online
        1 + // allow_atm
        1 + // allow_contactless
        8 + // contactless_limit
        4 + (2 * 50) + // allowed_countries
        4 + (2 * 50); // blocked_countries
}

// ============================================================================
// Velocity Limits
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct VelocityLimits {
    /// Maximum per single transaction (lamports/cents)
    pub per_transaction: u64,

    /// Maximum daily spending
    pub daily: u64,

    /// Maximum weekly spending
    pub weekly: u64,

    /// Maximum monthly spending
    pub monthly: u64,

    /// Maximum transactions per day
    pub max_daily_transactions: u16,

    /// Maximum transactions per week
    pub max_weekly_transactions: u16,

    /// Maximum transactions per month
    pub max_monthly_transactions: u16,
}

impl VelocityLimits {
    pub const SIZE: usize = 8 + 8 + 8 + 8 + 2 + 2 + 2;
}

// ============================================================================
// Velocity Counters
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct VelocityCounters {
    /// Current daily spending total
    pub daily_total: u64,

    /// Current weekly spending total
    pub weekly_total: u64,

    /// Current monthly spending total
    pub monthly_total: u64,

    /// Transaction counts
    pub daily_transaction_count: u16,
    pub weekly_transaction_count: u16,
    pub monthly_transaction_count: u16,

    /// Last reset slots
    pub last_daily_reset_slot: u64,
    pub last_weekly_reset_slot: u64,
    pub last_monthly_reset_slot: u64,
}

impl VelocityCounters {
    pub const SIZE: usize = 8 + 8 + 8 + 2 + 2 + 2 + 8 + 8 + 8;

    /// Record a transaction
    pub fn record_transaction(&mut self, amount: u64) {
        self.daily_total += amount;
        self.weekly_total += amount;
        self.monthly_total += amount;
        self.daily_transaction_count += 1;
        self.weekly_transaction_count += 1;
        self.monthly_transaction_count += 1;
    }

    /// Reset daily counters
    pub fn reset_daily(&mut self, current_slot: u64) {
        self.daily_total = 0;
        self.daily_transaction_count = 0;
        self.last_daily_reset_slot = current_slot;
    }

    /// Reset weekly counters
    pub fn reset_weekly(&mut self, current_slot: u64) {
        self.weekly_total = 0;
        self.weekly_transaction_count = 0;
        self.last_weekly_reset_slot = current_slot;
    }

    /// Reset monthly counters
    pub fn reset_monthly(&mut self, current_slot: u64) {
        self.monthly_total = 0;
        self.monthly_transaction_count = 0;
        self.last_monthly_reset_slot = current_slot;
    }
}

// ============================================================================
// Freeze Information
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FreezeInfo {
    /// Reason for freeze
    pub reason: FreezeReason,

    /// Who initiated the freeze
    pub frozen_by: Pubkey,

    /// When frozen
    pub frozen_at: i64,

    /// Optional expiry (auto-unfreeze)
    pub expires_at: Option<i64>,
}

impl FreezeInfo {
    pub const SIZE: usize = 1 + 32 + 8 + 9;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum FreezeReason {
    FraudDetected,
    UserRequest,
    AdminAction,
    VelocityBreach,
    SuspiciousActivity,
    LostOrStolen,
    ComplianceHold,
}

// ============================================================================
// Global Configuration
// ============================================================================

#[account]
pub struct GlobalConfig {
    /// PDA bump seed
    pub bump: u8,

    /// Program admin
    pub admin: Pubkey,

    /// Whether the entire program is paused
    pub is_paused: bool,

    /// Authorized velocity reset authorities (cron services)
    pub reset_authorities: Vec<Pubkey>,

    /// Authorized fraud detection services
    pub fraud_authorities: Vec<Pubkey>,

    /// Default velocity limits for new cards
    pub default_velocity_limits: VelocityLimits,

    /// Global statistics
    pub total_cards: u64,
    pub total_transactions: u64,
    pub total_volume: u64,

    /// Timestamps
    pub created_at: i64,
    pub updated_at: i64,
}

impl GlobalConfig {
    pub const SIZE: usize = 8 + // discriminator
        1 + // bump
        32 + // admin
        1 + // is_paused
        4 + (32 * 10) + // reset_authorities
        4 + (32 * 10) + // fraud_authorities
        VelocityLimits::SIZE +
        8 + // total_cards
        8 + // total_transactions
        8 + // total_volume
        8 + // created_at
        8; // updated_at

    /// Check if a pubkey is an authorized reset authority
    pub fn is_authorized_reset_authority(&self, authority: Pubkey) -> bool {
        self.admin == authority || self.reset_authorities.contains(&authority)
    }

    /// Check if a pubkey is an authorized fraud authority
    pub fn is_authorized_fraud_authority(&self, authority: Pubkey) -> bool {
        self.admin == authority || self.fraud_authorities.contains(&authority)
    }
}
