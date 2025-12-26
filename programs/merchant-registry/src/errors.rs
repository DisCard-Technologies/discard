//! Error definitions for the merchant registry

use anchor_lang::prelude::*;

#[error_code]
pub enum MerchantRegistryError {
    #[msg("Merchant name is too long (max 64 characters)")]
    MerchantNameTooLong,

    #[msg("Visa MID is too long (max 16 characters)")]
    VisaMidTooLong,

    #[msg("Metadata URI is too long (max 200 characters)")]
    MetadataUriTooLong,

    #[msg("Invalid risk tier (must be 1-4)")]
    InvalidRiskTier,

    #[msg("Invalid country code")]
    InvalidCountryCode,

    #[msg("Merchant is already registered")]
    MerchantAlreadyRegistered,

    #[msg("Merchant not found")]
    MerchantNotFound,

    #[msg("Merchant is already blocked")]
    MerchantAlreadyBlocked,

    #[msg("Unauthorized: only authority can perform this action")]
    Unauthorized,

    #[msg("Invalid MCC code")]
    InvalidMccCode,
}
