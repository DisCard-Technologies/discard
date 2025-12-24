//! DisCard 2035 - Transfer Hook Handler
//!
//! The core transfer hook that validates every token transfer.
//! This is called automatically by Token-2022 on every transfer.

use anchor_lang::prelude::*;
use crate::{TransferHook, errors::HookError};

/// Main transfer hook handler
/// Called by Token-2022 on every transfer
pub fn handler(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
    let card_config = &ctx.accounts.card_config;

    msg!("Transfer hook invoked:");
    msg!("  Amount: {}", amount);
    msg!("  Source: {}", ctx.accounts.source_account.key());
    msg!("  Destination: {}", ctx.accounts.destination_account.key());
    msg!("  Card Status: {:?}", card_config.status);

    // In production, extract merchant info from extra account metas
    // For now, validate without merchant data
    let merchant_id: Option<[u8; 32]> = None;
    let mcc_code: Option<u16> = None;

    // Perform all validation checks
    card_config.is_transaction_allowed(amount, merchant_id, mcc_code)?;

    msg!("Transfer hook validation passed");

    Ok(())
}

/// Validate a transaction before execution (read-only check)
pub fn validate_transaction(
    card_config: &crate::state::CardConfig,
    amount: u64,
    merchant_id: Option<[u8; 32]>,
    mcc_code: Option<u16>,
) -> Result<()> {
    card_config.is_transaction_allowed(amount, merchant_id, mcc_code)
}

/// Parse merchant data from extra account metas
/// In production, this would decode the merchant metadata from the extra accounts
pub fn parse_merchant_data(
    _extra_account_meta_list: &AccountInfo,
) -> Result<(Option<[u8; 32]>, Option<u16>)> {
    // Placeholder: In production, decode merchant ID and MCC from extra account metas
    Ok((None, None))
}
