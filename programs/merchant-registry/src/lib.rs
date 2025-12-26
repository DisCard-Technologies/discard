//! DisCard Merchant Registry Program
//!
//! On-chain registry for validating Visa/Solana merchants.
//! Stores merchant records as PDAs for efficient lookup.

use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;
pub mod errors;

use instructions::*;

declare_id!("MRCHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

#[program]
pub mod merchant_registry {
    use super::*;

    /// Initialize the merchant registry configuration
    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        instructions::initialize_registry::handler(ctx)
    }

    /// Register a new merchant
    pub fn register_merchant(
        ctx: Context<RegisterMerchant>,
        merchant_id: [u8; 32],
        merchant_name: String,
        visa_mid: String,
        mcc_code: u16,
        risk_tier: u8,
        country_code: [u8; 2],
        metadata_uri: Option<String>,
    ) -> Result<()> {
        instructions::register_merchant::handler(
            ctx,
            merchant_id,
            merchant_name,
            visa_mid,
            mcc_code,
            risk_tier,
            country_code,
            metadata_uri,
        )
    }

    /// Update merchant status or risk tier
    pub fn update_merchant(
        ctx: Context<UpdateMerchant>,
        risk_tier: Option<u8>,
        is_active: Option<bool>,
        metadata_uri: Option<String>,
    ) -> Result<()> {
        instructions::update_merchant::handler(ctx, risk_tier, is_active, metadata_uri)
    }

    /// Revoke a merchant (set to blocked)
    pub fn revoke_merchant(ctx: Context<RevokeMerchant>) -> Result<()> {
        instructions::revoke_merchant::handler(ctx)
    }
}
