//! Inco Lightning Spending Check Handler
//!
//! STATUS: BETA - Inco SVM is in beta. This module is for future use.
//! PRIMARY PATH: Confidential transfer hook uses ZK proofs (confidential_hook.rs)
//!
//! TEE-based confidential compute for realtime spending limit verification.
//! Provides ~50ms latency vs 1-5s for ZK proof generation, critical for
//! meeting the 800ms Marqeta authorization deadline.
//!
//! The handler (when Inco mainnet is ready):
//! 1. Validates card status (active, not frozen)
//! 2. Validates Inco handle freshness (epoch check)
//! 3. Performs CPI to Inco program for e_ge(encrypted_balance, amount)
//! 4. Updates handle if spending is approved

use anchor_lang::prelude::*;
use crate::errors::HookError;
use crate::state::CardConfig;

/// Inco Lightning program ID on Solana Devnet
pub const INCO_PROGRAM_ID: Pubkey = solana_program::pubkey!("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj");

/// Epoch duration in seconds (1 hour)
pub const INCO_EPOCH_DURATION: i64 = 3600;

/// Maximum epoch drift allowed (handles can be 1 epoch old)
pub const MAX_EPOCH_DRIFT: u64 = 1;

/// Inco spending check handler.
///
/// Performs a TEE-based comparison of encrypted balance against spending amount.
/// This is the fast path for authorization decisions (~50ms vs 1-5s for ZK proofs).
pub fn check_spending_limit(
    ctx: Context<IncoSpendingCheck>,
    amount: u64,
) -> Result<()> {
    let card_config = &ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Inco spending check invoked");
    msg!("  Card Status: {:?}", card_config.status);
    msg!("  Amount: {}", amount);

    // ======== Standard validations ========

    // Check card is active
    if card_config.status != crate::state::CardStatus::Active {
        return Err(error!(HookError::CardNotActive));
    }

    // Check not frozen
    if card_config.freeze_info.is_some() {
        return Err(error!(HookError::CardFrozen));
    }

    // Check Inco is enabled for this card
    if !card_config.inco_enabled {
        return Err(error!(HookError::IncoNotEnabled));
    }

    // ======== Inco-specific validations ========

    // Validate encrypted balance handle exists
    let encrypted_balance = card_config.encrypted_balance_handle
        .ok_or(error!(HookError::InvalidIncoHandle))?;

    // Validate Inco public key exists
    let _inco_pubkey = card_config.inco_public_key
        .ok_or(error!(HookError::InvalidIncoHandle))?;

    // Validate epoch freshness
    let current_epoch = (clock.unix_timestamp / INCO_EPOCH_DURATION) as u64;
    if card_config.inco_epoch + MAX_EPOCH_DRIFT < current_epoch {
        msg!("Inco epoch expired: stored={}, current={}", card_config.inco_epoch, current_epoch);
        return Err(error!(HookError::IncoEpochExpired));
    }

    // ======== CPI to Inco program ========

    // Perform the encrypted comparison via CPI
    // e_ge(encrypted_balance, amount) returns true if balance >= amount
    let result = perform_inco_comparison(
        &encrypted_balance,
        amount,
        &ctx.accounts.inco_program,
    )?;

    if !result {
        msg!("Inco spending check failed: insufficient balance");
        return Err(error!(HookError::IncoCheckFailed));
    }

    msg!("Inco spending check passed");

    Ok(())
}

/// Update encrypted balance after approved spending
///
/// Performs homomorphic subtraction: E(balance) - amount = E(balance - amount)
pub fn update_balance_after_spending(
    ctx: Context<IncoUpdateBalance>,
    spent_amount: u64,
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Updating Inco encrypted balance after spending: {}", spent_amount);

    // Validate Inco is enabled
    if !card_config.inco_enabled {
        return Err(error!(HookError::IncoNotEnabled));
    }

    // Validate handle exists
    let current_handle = card_config.encrypted_balance_handle
        .ok_or(error!(HookError::InvalidIncoHandle))?;

    // Perform encrypted subtraction via CPI
    let new_handle = perform_inco_subtraction(
        &current_handle,
        spent_amount,
        &ctx.accounts.inco_program,
    )?;

    // Update stored handle
    card_config.encrypted_balance_handle = Some(new_handle);

    // Update epoch to current
    let current_epoch = (clock.unix_timestamp / INCO_EPOCH_DURATION) as u64;
    card_config.inco_epoch = current_epoch;

    // Update timestamp
    card_config.updated_at = clock.unix_timestamp;
    card_config.last_transaction_at = Some(clock.unix_timestamp);

    msg!("Inco balance updated, new epoch: {}", current_epoch);

    Ok(())
}

/// Initialize Inco for a card
///
/// Sets up encrypted balance handle for new cards using Inco
pub fn initialize_inco(
    ctx: Context<InitializeInco>,
    encrypted_balance_handle: [u8; 16],
    inco_public_key: [u8; 32],
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Initializing Inco for card");

    // Set Inco fields
    card_config.encrypted_balance_handle = Some(encrypted_balance_handle);
    card_config.inco_public_key = Some(inco_public_key);
    card_config.inco_epoch = (clock.unix_timestamp / INCO_EPOCH_DURATION) as u64;
    card_config.inco_enabled = true;

    // Update timestamp
    card_config.updated_at = clock.unix_timestamp;

    msg!("Inco initialized with epoch: {}", card_config.inco_epoch);

    Ok(())
}

/// Refresh Inco handle epoch
///
/// Called when handle epoch is about to expire to maintain validity
pub fn refresh_inco_epoch(
    ctx: Context<RefreshIncoEpoch>,
    new_encrypted_balance_handle: [u8; 16],
) -> Result<()> {
    let card_config = &mut ctx.accounts.card_config;
    let clock = Clock::get()?;

    msg!("Refreshing Inco epoch");

    // Validate Inco is enabled
    if !card_config.inco_enabled {
        return Err(error!(HookError::IncoNotEnabled));
    }

    // Update handle and epoch
    card_config.encrypted_balance_handle = Some(new_encrypted_balance_handle);
    card_config.inco_epoch = (clock.unix_timestamp / INCO_EPOCH_DURATION) as u64;
    card_config.updated_at = clock.unix_timestamp;

    msg!("Inco epoch refreshed to: {}", card_config.inco_epoch);

    Ok(())
}

// ============================================================================
// CPI Helpers (Simulated for development)
// ============================================================================

/// Perform CPI to Inco program for e_ge comparison
///
/// In production, this invokes the Inco Lightning program via CPI.
fn perform_inco_comparison(
    encrypted_balance: &[u8; 16],
    amount: u64,
    _inco_program: &AccountInfo,
) -> Result<bool> {
    // In production, this would:
    // 1. Build CPI instruction for Inco e_ge(encrypted_balance, amount)
    // 2. Invoke Inco program
    // 3. Parse result from return data

    msg!("Performing Inco CPI comparison: handle={:?}, amount={}",
         &encrypted_balance[..4], amount);

    // Simulated comparison for development
    // In production, this is done entirely in the TEE
    let balance_hint = u64::from_le_bytes([
        encrypted_balance[0], encrypted_balance[1],
        encrypted_balance[2], encrypted_balance[3],
        encrypted_balance[4], encrypted_balance[5],
        encrypted_balance[6], encrypted_balance[7],
    ]);

    msg!("Inco CPI result: balance_hint={}, amount={}, result={}",
         balance_hint, amount, balance_hint >= amount);

    Ok(balance_hint >= amount)
}

/// Perform CPI to Inco program for encrypted subtraction
///
/// Computes E(balance - amount) using homomorphic properties
fn perform_inco_subtraction(
    encrypted_balance: &[u8; 16],
    amount: u64,
    _inco_program: &AccountInfo,
) -> Result<[u8; 16]> {
    // In production, this would:
    // 1. Build CPI instruction for Inco e_sub(encrypted_balance, amount)
    // 2. Invoke Inco program
    // 3. Return new encrypted handle from return data

    msg!("Performing Inco CPI subtraction: amount={}", amount);

    // Simulated subtraction for development
    let balance_hint = u64::from_le_bytes([
        encrypted_balance[0], encrypted_balance[1],
        encrypted_balance[2], encrypted_balance[3],
        encrypted_balance[4], encrypted_balance[5],
        encrypted_balance[6], encrypted_balance[7],
    ]);

    let new_balance = balance_hint.saturating_sub(amount);
    let new_balance_bytes = new_balance.to_le_bytes();

    let mut new_handle = [0u8; 16];
    new_handle[..8].copy_from_slice(&new_balance_bytes);
    // Preserve randomness portion
    new_handle[8..].copy_from_slice(&encrypted_balance[8..]);

    Ok(new_handle)
}

// ============================================================================
// Account Contexts
// ============================================================================

#[derive(Accounts)]
pub struct IncoSpendingCheck<'info> {
    /// The card configuration PDA (read-only for spending check)
    pub card_config: Account<'info, CardConfig>,

    /// The authority performing the spending check
    pub authority: Signer<'info>,

    /// The Inco Lightning program for CPI
    /// CHECK: Validated by address constraint
    #[account(address = INCO_PROGRAM_ID)]
    pub inco_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct IncoUpdateBalance<'info> {
    /// The card configuration PDA (mutable for balance update)
    #[account(mut)]
    pub card_config: Account<'info, CardConfig>,

    /// The authority updating the balance (must be authorized)
    pub authority: Signer<'info>,

    /// The Inco Lightning program for CPI
    /// CHECK: Validated by address constraint
    #[account(address = INCO_PROGRAM_ID)]
    pub inco_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct InitializeInco<'info> {
    /// The card configuration PDA (mutable for initialization)
    #[account(
        mut,
        constraint = card_config.owner_did_hash == authority_did_hash(authority.key())
            @ HookError::Unauthorized,
    )]
    pub card_config: Account<'info, CardConfig>,

    /// The card owner authorizing Inco setup
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RefreshIncoEpoch<'info> {
    /// The card configuration PDA (mutable for refresh)
    #[account(
        mut,
        constraint = card_config.owner_did_hash == authority_did_hash(authority.key())
            @ HookError::Unauthorized,
    )]
    pub card_config: Account<'info, CardConfig>,

    /// The card owner or authorized delegate
    pub authority: Signer<'info>,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Derive authority DID hash from pubkey
fn authority_did_hash(authority: Pubkey) -> [u8; 32] {
    authority.to_bytes()
}
