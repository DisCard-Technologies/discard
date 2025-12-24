//! DisCard 2035 - Merchant Whitelist/Blocklist Instructions

use anchor_lang::prelude::*;
use crate::{UpdateMerchantList, errors::HookError, state::MAX_MERCHANTS};

/// Add merchants to whitelist
pub fn add_to_whitelist(
    ctx: Context<UpdateMerchantList>,
    merchants: Vec<[u8; 32]>,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Adding {} merchants to whitelist", merchants.len());

    for merchant in merchants {
        if card_config.merchant_whitelist.len() >= MAX_MERCHANTS {
            return Err(error!(HookError::MerchantWhitelistFull));
        }

        if !card_config.merchant_whitelist.contains(&merchant) {
            card_config.merchant_whitelist.push(merchant);
            msg!("Added merchant: {:?}", merchant);
        }
    }

    // Enable whitelist if merchants were added
    if !card_config.merchant_whitelist.is_empty() {
        card_config.merchant_whitelist_enabled = true;
    }

    card_config.updated_at = clock.unix_timestamp;

    msg!("Merchant whitelist updated. Total: {}", card_config.merchant_whitelist.len());

    Ok(())
}

/// Remove merchants from whitelist
pub fn remove_from_whitelist(
    ctx: Context<UpdateMerchantList>,
    merchants: Vec<[u8; 32]>,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Removing {} merchants from whitelist", merchants.len());

    for merchant in merchants {
        if let Some(pos) = card_config.merchant_whitelist.iter().position(|m| *m == merchant) {
            card_config.merchant_whitelist.remove(pos);
            msg!("Removed merchant: {:?}", merchant);
        }
    }

    // Disable whitelist if empty
    if card_config.merchant_whitelist.is_empty() {
        card_config.merchant_whitelist_enabled = false;
    }

    card_config.updated_at = clock.unix_timestamp;

    msg!("Merchant whitelist updated. Total: {}", card_config.merchant_whitelist.len());

    Ok(())
}

/// Add merchants to blocklist
pub fn add_to_blocklist(
    ctx: Context<UpdateMerchantList>,
    merchants: Vec<[u8; 32]>,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Adding {} merchants to blocklist", merchants.len());

    for merchant in merchants {
        if card_config.merchant_blocklist.len() >= MAX_MERCHANTS {
            return Err(error!(HookError::MerchantBlocklistFull));
        }

        if !card_config.merchant_blocklist.contains(&merchant) {
            card_config.merchant_blocklist.push(merchant);
            msg!("Blocked merchant: {:?}", merchant);
        }
    }

    card_config.updated_at = clock.unix_timestamp;

    msg!("Merchant blocklist updated. Total: {}", card_config.merchant_blocklist.len());

    Ok(())
}

/// Remove merchants from blocklist
pub fn remove_from_blocklist(
    ctx: Context<UpdateMerchantList>,
    merchants: Vec<[u8; 32]>,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Removing {} merchants from blocklist", merchants.len());

    for merchant in merchants {
        if let Some(pos) = card_config.merchant_blocklist.iter().position(|m| *m == merchant) {
            card_config.merchant_blocklist.remove(pos);
            msg!("Unblocked merchant: {:?}", merchant);
        }
    }

    card_config.updated_at = clock.unix_timestamp;

    msg!("Merchant blocklist updated. Total: {}", card_config.merchant_blocklist.len());

    Ok(())
}
