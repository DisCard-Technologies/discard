//! DisCard 2035 - MCC (Merchant Category Code) Instructions

use anchor_lang::prelude::*;
use crate::{UpdateMccList, errors::HookError, state::MAX_MCC_CODES};

/// Add MCC codes to whitelist
pub fn add_to_whitelist(
    ctx: Context<UpdateMccList>,
    mcc_codes: Vec<u16>,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Adding {} MCC codes to whitelist", mcc_codes.len());

    for mcc in mcc_codes {
        // Validate MCC code range (0001-9999)
        if mcc == 0 || mcc > 9999 {
            return Err(error!(HookError::InvalidMccCode));
        }

        if card_config.mcc_whitelist.len() >= MAX_MCC_CODES {
            return Err(error!(HookError::MccWhitelistFull));
        }

        if !card_config.mcc_whitelist.contains(&mcc) {
            card_config.mcc_whitelist.push(mcc);
            msg!("Added MCC: {}", mcc);
        }
    }

    // Enable whitelist if MCC codes were added
    if !card_config.mcc_whitelist.is_empty() {
        card_config.mcc_whitelist_enabled = true;
    }

    card_config.updated_at = clock.unix_timestamp;

    msg!("MCC whitelist updated. Total: {}", card_config.mcc_whitelist.len());

    Ok(())
}

/// Remove MCC codes from whitelist
pub fn remove_from_whitelist(
    ctx: Context<UpdateMccList>,
    mcc_codes: Vec<u16>,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Removing {} MCC codes from whitelist", mcc_codes.len());

    for mcc in mcc_codes {
        if let Some(pos) = card_config.mcc_whitelist.iter().position(|m| *m == mcc) {
            card_config.mcc_whitelist.remove(pos);
            msg!("Removed MCC: {}", mcc);
        }
    }

    // Disable whitelist if empty
    if card_config.mcc_whitelist.is_empty() {
        card_config.mcc_whitelist_enabled = false;
    }

    card_config.updated_at = clock.unix_timestamp;

    msg!("MCC whitelist updated. Total: {}", card_config.mcc_whitelist.len());

    Ok(())
}

/// Add MCC codes to blocklist
pub fn add_to_blocklist(
    ctx: Context<UpdateMccList>,
    mcc_codes: Vec<u16>,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Adding {} MCC codes to blocklist", mcc_codes.len());

    for mcc in mcc_codes {
        // Validate MCC code range (0001-9999)
        if mcc == 0 || mcc > 9999 {
            return Err(error!(HookError::InvalidMccCode));
        }

        if card_config.mcc_blocklist.len() >= MAX_MCC_CODES {
            return Err(error!(HookError::MccBlocklistFull));
        }

        if !card_config.mcc_blocklist.contains(&mcc) {
            card_config.mcc_blocklist.push(mcc);
            msg!("Blocked MCC: {}", mcc);
        }
    }

    card_config.updated_at = clock.unix_timestamp;

    msg!("MCC blocklist updated. Total: {}", card_config.mcc_blocklist.len());

    Ok(())
}

/// Remove MCC codes from blocklist
pub fn remove_from_blocklist(
    ctx: Context<UpdateMccList>,
    mcc_codes: Vec<u16>,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Removing {} MCC codes from blocklist", mcc_codes.len());

    for mcc in mcc_codes {
        if let Some(pos) = card_config.mcc_blocklist.iter().position(|m| *m == mcc) {
            card_config.mcc_blocklist.remove(pos);
            msg!("Unblocked MCC: {}", mcc);
        }
    }

    card_config.updated_at = clock.unix_timestamp;

    msg!("MCC blocklist updated. Total: {}", card_config.mcc_blocklist.len());

    Ok(())
}

// ============================================================================
// Common MCC Categories for Reference
// ============================================================================

/// High-risk MCC codes that might be blocked by default
pub const HIGH_RISK_MCC_CODES: [u16; 10] = [
    5933, // Pawn shops
    5944, // Jewelry stores
    5993, // Cigar stores
    6010, // Financial institutions - manual cash
    6011, // ATMs
    6012, // Financial institutions
    7273, // Dating services
    7995, // Gambling
    9402, // Postal services
    9405, // Intra-government purchases
];

/// Gambling-related MCC codes
pub const GAMBLING_MCC_CODES: [u16; 4] = [
    7800, // State lotteries
    7801, // Betting
    7802, // Horse racing
    7995, // Gambling (casinos, etc.)
];

/// Travel-related MCC codes
pub const TRAVEL_MCC_CODES: [u16; 6] = [
    3000, // Airlines
    4111, // Transportation - suburban/commuter
    4112, // Passenger railways
    4121, // Taxicabs
    4131, // Bus lines
    7011, // Lodging
];
