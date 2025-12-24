//! Policy instruction handlers

use anchor_lang::prelude::*;
use crate::{UpdateMerchantWhitelist, UpdateMccWhitelist, CompressedProof};

/// Update merchant whitelist for a card
pub fn update_merchant_whitelist(
    ctx: Context<UpdateMerchantWhitelist>,
    card_id: [u8; 32],
    merchants_to_add: Vec<[u8; 32]>,
    merchants_to_remove: Vec<[u8; 32]>,
    proof: CompressedProof,
) -> Result<()> {
    // In production:
    // 1. Verify the proof
    // 2. Decompress current card state
    // 3. Update merchant whitelist entries
    // 4. Recompress with new state

    msg!("Updating merchant whitelist for card: {:?}", card_id);
    msg!("Adding {} merchants", merchants_to_add.len());
    msg!("Removing {} merchants", merchants_to_remove.len());

    for merchant in &merchants_to_add {
        msg!("Adding merchant: {:?}", merchant);
    }

    for merchant in &merchants_to_remove {
        msg!("Removing merchant: {:?}", merchant);
    }

    Ok(())
}

/// Update MCC whitelist for a card
pub fn update_mcc_whitelist(
    ctx: Context<UpdateMccWhitelist>,
    card_id: [u8; 32],
    mcc_codes_to_add: Vec<u16>,
    mcc_codes_to_remove: Vec<u16>,
    proof: CompressedProof,
) -> Result<()> {
    // In production:
    // 1. Verify the proof
    // 2. Decompress current card state
    // 3. Update MCC whitelist entries
    // 4. Recompress with new state

    msg!("Updating MCC whitelist for card: {:?}", card_id);
    msg!("Adding {} MCC codes", mcc_codes_to_add.len());
    msg!("Removing {} MCC codes", mcc_codes_to_remove.len());

    for mcc in &mcc_codes_to_add {
        msg!("Adding MCC: {}", mcc);
    }

    for mcc in &mcc_codes_to_remove {
        msg!("Removing MCC: {}", mcc);
    }

    Ok(())
}

/// Validate a transaction against policy
pub fn validate_policy(
    card_id: [u8; 32],
    merchant_id: Option<[u8; 32]>,
    mcc_code: Option<u16>,
    _merchant_whitelist: &[[u8; 32]],
    _mcc_whitelist: &[u16],
    merchant_locking_enabled: bool,
    mcc_locking_enabled: bool,
) -> Result<()> {
    // If merchant locking is enabled, check whitelist
    if merchant_locking_enabled {
        if let Some(mid) = merchant_id {
            // In production, check if merchant is in whitelist
            msg!("Checking merchant {:?} against whitelist", mid);
        }
    }

    // If MCC locking is enabled, check whitelist
    if mcc_locking_enabled {
        if let Some(mcc) = mcc_code {
            // In production, check if MCC is in whitelist
            msg!("Checking MCC {} against whitelist", mcc);
        }
    }

    Ok(())
}
