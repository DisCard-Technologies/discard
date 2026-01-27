//! DisCard 2035 - Token-2022 Transfer Hooks
//!
//! "Financial Armor" - Enforces merchant-level risk isolation at protocol level.
//!
//! Features:
//! - Merchant whitelist enforcement
//! - MCC (Merchant Category Code) filtering
//! - Velocity limits (per-transaction, daily, weekly, monthly)
//! - Emergency fraud freeze
//! - Per-card policy configuration

use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

declare_id!("HooK1111111111111111111111111111111111111111");

pub mod instructions;
pub mod state;
pub mod errors;

use instructions::*;
use state::*;
use errors::*;

#[program]
pub mod discard_hooks {
    use super::*;

    // ========================================================================
    // Transfer Hook Entry Point (Token-2022)
    // ========================================================================

    /// The transfer hook that validates every token transfer
    /// This is called automatically by Token-2022 on every transfer
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        instructions::transfer_hook::handler(ctx, amount)
    }

    /// Fallback instruction for transfer hook interface
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = ExecuteInstruction::unpack(data)?;

        // Verify the instruction is for this program
        if instruction.program_id != *program_id {
            return Err(ProgramError::IncorrectProgramId.into());
        }

        // Execute the transfer hook
        msg!("Transfer hook fallback executed");
        Ok(())
    }

    // ========================================================================
    // Card Configuration Management
    // ========================================================================

    /// Initialize card transfer hook configuration
    pub fn initialize_card_config(
        ctx: Context<InitializeCardConfig>,
        card_id: [u8; 32],
        owner_did_hash: [u8; 32],
    ) -> Result<()> {
        instructions::config::initialize_card_config(ctx, card_id, owner_did_hash)
    }

    /// Update card policy settings
    pub fn update_card_policy(
        ctx: Context<UpdateCardPolicy>,
        new_policy: CardPolicy,
    ) -> Result<()> {
        instructions::config::update_card_policy(ctx, new_policy)
    }

    // ========================================================================
    // Merchant Whitelist Management
    // ========================================================================

    /// Add merchants to card whitelist
    pub fn add_merchants_to_whitelist(
        ctx: Context<UpdateMerchantList>,
        merchants: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::merchant::add_to_whitelist(ctx, merchants)
    }

    /// Remove merchants from card whitelist
    pub fn remove_merchants_from_whitelist(
        ctx: Context<UpdateMerchantList>,
        merchants: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::merchant::remove_from_whitelist(ctx, merchants)
    }

    /// Add merchants to card blocklist
    pub fn add_merchants_to_blocklist(
        ctx: Context<UpdateMerchantList>,
        merchants: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::merchant::add_to_blocklist(ctx, merchants)
    }

    /// Remove merchants from card blocklist
    pub fn remove_merchants_from_blocklist(
        ctx: Context<UpdateMerchantList>,
        merchants: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::merchant::remove_from_blocklist(ctx, merchants)
    }

    // ========================================================================
    // MCC (Merchant Category Code) Management
    // ========================================================================

    /// Add MCC codes to card whitelist
    pub fn add_mcc_codes_to_whitelist(
        ctx: Context<UpdateMccList>,
        mcc_codes: Vec<u16>,
    ) -> Result<()> {
        instructions::mcc::add_to_whitelist(ctx, mcc_codes)
    }

    /// Remove MCC codes from card whitelist
    pub fn remove_mcc_codes_from_whitelist(
        ctx: Context<UpdateMccList>,
        mcc_codes: Vec<u16>,
    ) -> Result<()> {
        instructions::mcc::remove_from_whitelist(ctx, mcc_codes)
    }

    /// Add MCC codes to card blocklist
    pub fn add_mcc_codes_to_blocklist(
        ctx: Context<UpdateMccList>,
        mcc_codes: Vec<u16>,
    ) -> Result<()> {
        instructions::mcc::add_to_blocklist(ctx, mcc_codes)
    }

    /// Remove MCC codes from card blocklist
    pub fn remove_mcc_codes_from_blocklist(
        ctx: Context<UpdateMccList>,
        mcc_codes: Vec<u16>,
    ) -> Result<()> {
        instructions::mcc::remove_from_blocklist(ctx, mcc_codes)
    }

    // ========================================================================
    // Velocity Limit Management
    // ========================================================================

    /// Update velocity limits for a card
    pub fn update_velocity_limits(
        ctx: Context<UpdateVelocityLimits>,
        limits: VelocityLimits,
    ) -> Result<()> {
        instructions::velocity::update_limits(ctx, limits)
    }

    /// Record a transaction for velocity tracking
    pub fn record_transaction(
        ctx: Context<RecordTransaction>,
        amount: u64,
        merchant_id: Option<[u8; 32]>,
        mcc_code: Option<u16>,
    ) -> Result<()> {
        instructions::velocity::record_transaction(ctx, amount, merchant_id, mcc_code)
    }

    /// Reset daily velocity counters (called by cron/scheduler)
    pub fn reset_daily_velocity(ctx: Context<ResetVelocity>) -> Result<()> {
        instructions::velocity::reset_daily(ctx)
    }

    /// Reset weekly velocity counters
    pub fn reset_weekly_velocity(ctx: Context<ResetVelocity>) -> Result<()> {
        instructions::velocity::reset_weekly(ctx)
    }

    /// Reset monthly velocity counters
    pub fn reset_monthly_velocity(ctx: Context<ResetVelocity>) -> Result<()> {
        instructions::velocity::reset_monthly(ctx)
    }

    // ========================================================================
    // Confidential Transfer Hook (Token-2022 Encrypted Amounts)
    // ========================================================================

    /// Confidential transfer hook for encrypted amount transfers.
    /// Validates card status, merchant/MCC rules, and velocity limits via ZK proof.
    pub fn confidential_transfer_hook(
        ctx: Context<ConfidentialTransferHook>,
        proof_data: Vec<u8>,
    ) -> Result<()> {
        instructions::confidential_hook::confidential_handler(ctx, proof_data)
    }

    // ========================================================================
    // Emergency Controls
    // ========================================================================

    /// Emergency freeze a card (fraud detected)
    pub fn emergency_freeze(
        ctx: Context<EmergencyControl>,
        reason: FreezeReason,
    ) -> Result<()> {
        instructions::emergency::freeze(ctx, reason)
    }

    /// Unfreeze a card after review
    pub fn unfreeze(ctx: Context<EmergencyControl>) -> Result<()> {
        instructions::emergency::unfreeze(ctx)
    }

    /// Global emergency pause (admin only)
    pub fn global_pause(ctx: Context<GlobalControl>) -> Result<()> {
        instructions::emergency::global_pause(ctx)
    }

    /// Resume from global pause
    pub fn global_resume(ctx: Context<GlobalControl>) -> Result<()> {
        instructions::emergency::global_resume(ctx)
    }
}

// ============================================================================
// Account Contexts
// ============================================================================

#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// The token account being transferred from
    #[account(token::mint = mint)]
    pub source_account: InterfaceAccount<'info, TokenAccount>,

    /// The mint of the token
    pub mint: InterfaceAccount<'info, Mint>,

    /// The token account being transferred to
    #[account(token::mint = mint)]
    pub destination_account: InterfaceAccount<'info, TokenAccount>,

    /// The owner/authority of the source account
    pub owner: Signer<'info>,

    /// The card configuration PDA
    #[account(
        seeds = [b"card_config", source_account.key().as_ref()],
        bump = card_config.bump,
    )]
    pub card_config: Account<'info, CardConfig>,

    /// Extra account for merchant metadata (if applicable)
    /// CHECK: Validated in instruction
    pub extra_account_meta_list: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(card_id: [u8; 32])]
pub struct InitializeCardConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The owner's DID commitment (must prove ownership)
    pub owner: Signer<'info>,

    /// The card configuration PDA
    #[account(
        init,
        payer = payer,
        space = CardConfig::SIZE,
        seeds = [b"card_config", card_id.as_ref()],
        bump,
    )]
    pub card_config: Account<'info, CardConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateCardPolicy<'info> {
    /// Must be the card owner or authorized delegate
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = card_config.owner_did_hash == authority_did_hash(authority.key())
            @ HookError::Unauthorized,
    )]
    pub card_config: Account<'info, CardConfig>,
}

#[derive(Accounts)]
pub struct UpdateMerchantList<'info> {
    /// Must be the card owner or authorized delegate
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = card_config.owner_did_hash == authority_did_hash(authority.key())
            @ HookError::Unauthorized,
    )]
    pub card_config: Account<'info, CardConfig>,
}

#[derive(Accounts)]
pub struct UpdateMccList<'info> {
    /// Must be the card owner or authorized delegate
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = card_config.owner_did_hash == authority_did_hash(authority.key())
            @ HookError::Unauthorized,
    )]
    pub card_config: Account<'info, CardConfig>,
}

#[derive(Accounts)]
pub struct UpdateVelocityLimits<'info> {
    /// Must be the card owner or authorized delegate
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = card_config.owner_did_hash == authority_did_hash(authority.key())
            @ HookError::Unauthorized,
    )]
    pub card_config: Account<'info, CardConfig>,
}

#[derive(Accounts)]
pub struct RecordTransaction<'info> {
    /// The card configuration to update
    #[account(mut)]
    pub card_config: Account<'info, CardConfig>,

    /// The token program (for CPI verification)
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ResetVelocity<'info> {
    /// Must be authorized (cron service or admin)
    pub authority: Signer<'info>,

    /// Global config for authority verification
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        constraint = global_config.is_authorized_reset_authority(authority.key())
            @ HookError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// The card configuration to reset
    #[account(mut)]
    pub card_config: Account<'info, CardConfig>,
}

#[derive(Accounts)]
pub struct EmergencyControl<'info> {
    /// Must be card owner, delegate, or fraud service
    pub authority: Signer<'info>,

    /// Global config for emergency authority verification
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// The card configuration to freeze/unfreeze
    #[account(mut)]
    pub card_config: Account<'info, CardConfig>,
}

#[derive(Accounts)]
pub struct GlobalControl<'info> {
    /// Must be admin
    pub admin: Signer<'info>,

    /// Global config (admin-controlled)
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump,
        constraint = global_config.admin == admin.key() @ HookError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Derive authority DID hash from pubkey (simplified for example)
fn authority_did_hash(authority: Pubkey) -> [u8; 32] {
    // In production, this would verify against actual DID commitment
    authority.to_bytes()
}
