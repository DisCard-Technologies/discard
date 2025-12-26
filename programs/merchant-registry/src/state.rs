//! Account structures for the merchant registry

use anchor_lang::prelude::*;

/// Maximum length for merchant name
pub const MAX_MERCHANT_NAME_LEN: usize = 64;

/// Maximum length for Visa MID
pub const MAX_VISA_MID_LEN: usize = 16;

/// Maximum length for metadata URI
pub const MAX_METADATA_URI_LEN: usize = 200;

/// Merchant Registry Configuration
#[account]
#[derive(InitSpace)]
pub struct MerchantRegistryConfig {
    /// Admin authority (multisig recommended)
    pub authority: Pubkey,

    /// Total number of registered merchants
    pub total_merchants: u64,

    /// Number of blocked merchants
    pub blocked_count: u64,

    /// Slot when last updated
    pub last_updated: i64,

    /// PDA bump seed
    pub bump: u8,
}

impl MerchantRegistryConfig {
    pub const SEED: &'static [u8] = b"merchant_config";
}

/// Individual Merchant Record
#[account]
#[derive(InitSpace)]
pub struct MerchantRecord {
    /// Unique merchant identifier (32 bytes, usually hashed)
    pub merchant_id: [u8; 32],

    /// Display name
    #[max_len(MAX_MERCHANT_NAME_LEN)]
    pub merchant_name: String,

    /// Visa Merchant ID
    #[max_len(MAX_VISA_MID_LEN)]
    pub visa_mid: String,

    /// Merchant Category Code
    pub mcc_code: u16,

    /// Risk tier (1=low, 2=medium, 3=high, 4=blocked)
    pub risk_tier: u8,

    /// Whether merchant is active
    pub is_active: bool,

    /// ISO 3166-1 alpha-2 country code
    pub country_code: [u8; 2],

    /// Slot when registered
    pub registered_at: i64,

    /// Slot when last updated
    pub updated_at: i64,

    /// Authority that registered this merchant
    pub registered_by: Pubkey,

    /// Optional IPFS/Arweave metadata URI
    #[max_len(MAX_METADATA_URI_LEN)]
    pub metadata_uri: Option<String>,

    /// PDA bump seed
    pub bump: u8,
}

impl MerchantRecord {
    pub const SEED: &'static [u8] = b"merchant";

    /// Check if merchant is valid for transactions
    pub fn is_valid(&self) -> bool {
        self.is_active && self.risk_tier < 4
    }

    /// Get the account size for rent calculation
    pub fn space() -> usize {
        8 + // discriminator
        32 + // merchant_id
        4 + MAX_MERCHANT_NAME_LEN + // merchant_name (string with length prefix)
        4 + MAX_VISA_MID_LEN + // visa_mid
        2 + // mcc_code
        1 + // risk_tier
        1 + // is_active
        2 + // country_code
        8 + // registered_at
        8 + // updated_at
        32 + // registered_by
        1 + 4 + MAX_METADATA_URI_LEN + // metadata_uri (optional string)
        1 // bump
    }
}

/// Risk tier constants
pub mod risk_tier {
    /// Low risk - auto-approve
    pub const LOW: u8 = 1;
    /// Medium risk - standard checks
    pub const MEDIUM: u8 = 2;
    /// High risk - enhanced verification
    pub const HIGH: u8 = 3;
    /// Blocked - always deny
    pub const BLOCKED: u8 = 4;
}
