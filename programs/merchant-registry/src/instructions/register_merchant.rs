//! Register a new merchant in the registry

use anchor_lang::prelude::*;
use crate::state::{MerchantRecord, MerchantRegistryConfig, MAX_MERCHANT_NAME_LEN, MAX_VISA_MID_LEN, MAX_METADATA_URI_LEN};
use crate::errors::MerchantRegistryError;

#[derive(Accounts)]
#[instruction(merchant_id: [u8; 32])]
pub struct RegisterMerchant<'info> {
    #[account(
        mut,
        seeds = [MerchantRegistryConfig::SEED],
        bump = config.bump,
        constraint = config.authority == authority.key() @ MerchantRegistryError::Unauthorized
    )]
    pub config: Account<'info, MerchantRegistryConfig>,

    #[account(
        init,
        payer = authority,
        space = MerchantRecord::space(),
        seeds = [MerchantRecord::SEED, merchant_id.as_ref()],
        bump
    )]
    pub merchant: Account<'info, MerchantRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterMerchant>,
    merchant_id: [u8; 32],
    merchant_name: String,
    visa_mid: String,
    mcc_code: u16,
    risk_tier: u8,
    country_code: [u8; 2],
    metadata_uri: Option<String>,
) -> Result<()> {
    // Validate inputs
    require!(
        merchant_name.len() <= MAX_MERCHANT_NAME_LEN,
        MerchantRegistryError::MerchantNameTooLong
    );

    require!(
        visa_mid.len() <= MAX_VISA_MID_LEN,
        MerchantRegistryError::VisaMidTooLong
    );

    require!(
        risk_tier >= 1 && risk_tier <= 4,
        MerchantRegistryError::InvalidRiskTier
    );

    if let Some(ref uri) = metadata_uri {
        require!(
            uri.len() <= MAX_METADATA_URI_LEN,
            MerchantRegistryError::MetadataUriTooLong
        );
    }

    // Validate country code (basic ASCII check)
    require!(
        country_code[0].is_ascii_uppercase() && country_code[1].is_ascii_uppercase(),
        MerchantRegistryError::InvalidCountryCode
    );

    let clock = Clock::get()?;
    let merchant = &mut ctx.accounts.merchant;

    merchant.merchant_id = merchant_id;
    merchant.merchant_name = merchant_name;
    merchant.visa_mid = visa_mid;
    merchant.mcc_code = mcc_code;
    merchant.risk_tier = risk_tier;
    merchant.is_active = true;
    merchant.country_code = country_code;
    merchant.registered_at = clock.unix_timestamp;
    merchant.updated_at = clock.unix_timestamp;
    merchant.registered_by = ctx.accounts.authority.key();
    merchant.metadata_uri = metadata_uri;
    merchant.bump = ctx.bumps.merchant;

    // Update config
    let config = &mut ctx.accounts.config;
    config.total_merchants = config.total_merchants.checked_add(1).unwrap();
    config.last_updated = clock.unix_timestamp;

    if risk_tier == 4 {
        config.blocked_count = config.blocked_count.checked_add(1).unwrap();
    }

    msg!(
        "Registered merchant: {} (MCC: {}, Risk: {})",
        merchant.merchant_name,
        mcc_code,
        risk_tier
    );

    Ok(())
}
