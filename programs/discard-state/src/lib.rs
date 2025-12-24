//! DisCard 2035 - ZK Compressed State Management
//!
//! This Anchor program manages compressed PDAs for virtual cards and DID commitments
//! using Light Protocol's ZK Compression.
//!
//! Key features:
//! - Compressed card state PDAs (near-zero rent)
//! - DID commitment anchoring
//! - Merchant-level policy enforcement
//! - Firedancer/Alpenglow-ready design

use anchor_lang::prelude::*;
use light_sdk::compressed_account::CompressedAccountWithMerkleContext;
use light_sdk::merkle_context::PackedMerkleContext;

pub mod instructions;
pub mod state;
pub mod error;

use instructions::*;
use state::*;
use error::*;

declare_id!("DCrd1111111111111111111111111111111111111111");

#[program]
pub mod discard_state {
    use super::*;

    // ========================================================================
    // Card State Instructions
    // ========================================================================

    /// Create a new compressed card state account
    pub fn create_compressed_card(
        ctx: Context<CreateCompressedCard>,
        card_id: [u8; 32],
        owner_did_commitment: [u8; 32],
        spending_limit: u64,
        daily_limit: u64,
        monthly_limit: u64,
    ) -> Result<()> {
        instructions::card::create_compressed_card(
            ctx,
            card_id,
            owner_did_commitment,
            spending_limit,
            daily_limit,
            monthly_limit,
        )
    }

    /// Update card balance after funding or spending
    pub fn update_card_balance(
        ctx: Context<UpdateCardBalance>,
        card_id: [u8; 32],
        new_balance: u64,
        proof: CompressedProof,
    ) -> Result<()> {
        instructions::card::update_card_balance(ctx, card_id, new_balance, proof)
    }

    /// Record spending and update velocity counters
    pub fn record_spending(
        ctx: Context<RecordSpending>,
        card_id: [u8; 32],
        spend_amount: u64,
        merchant_id: Option<[u8; 32]>,
        mcc_code: Option<u16>,
        proof: CompressedProof,
    ) -> Result<()> {
        instructions::card::record_spending(
            ctx,
            card_id,
            spend_amount,
            merchant_id,
            mcc_code,
            proof,
        )
    }

    /// Freeze a card (emergency action)
    pub fn freeze_card(
        ctx: Context<FreezeCard>,
        card_id: [u8; 32],
        reason: FreezeReason,
        proof: CompressedProof,
    ) -> Result<()> {
        instructions::card::freeze_card(ctx, card_id, reason, proof)
    }

    /// Unfreeze a card
    pub fn unfreeze_card(
        ctx: Context<UnfreezeCard>,
        card_id: [u8; 32],
        proof: CompressedProof,
    ) -> Result<()> {
        instructions::card::unfreeze_card(ctx, card_id, proof)
    }

    /// Update card spending limits
    pub fn update_card_limits(
        ctx: Context<UpdateCardLimits>,
        card_id: [u8; 32],
        new_spending_limit: Option<u64>,
        new_daily_limit: Option<u64>,
        new_monthly_limit: Option<u64>,
        proof: CompressedProof,
    ) -> Result<()> {
        instructions::card::update_card_limits(
            ctx,
            card_id,
            new_spending_limit,
            new_daily_limit,
            new_monthly_limit,
            proof,
        )
    }

    // ========================================================================
    // DID Commitment Instructions
    // ========================================================================

    /// Store a DID commitment on-chain
    pub fn store_did_commitment(
        ctx: Context<StoreDIDCommitment>,
        did_string: String,
        commitment_hash: [u8; 32],
        document_hash: [u8; 32],
        recovery_threshold: u8,
    ) -> Result<()> {
        instructions::did::store_did_commitment(
            ctx,
            did_string,
            commitment_hash,
            document_hash,
            recovery_threshold,
        )
    }

    /// Update DID commitment after key rotation
    pub fn update_did_commitment(
        ctx: Context<UpdateDIDCommitment>,
        did_string: String,
        new_commitment_hash: [u8; 32],
        new_document_hash: [u8; 32],
        proof: CompressedProof,
    ) -> Result<()> {
        instructions::did::update_did_commitment(
            ctx,
            did_string,
            new_commitment_hash,
            new_document_hash,
            proof,
        )
    }

    /// Verify a DID recovery using guardian attestations
    pub fn verify_recovery(
        ctx: Context<VerifyRecovery>,
        did_string: String,
        new_key_commitment: [u8; 32],
        guardian_attestations: Vec<GuardianAttestation>,
        recovery_proof: CompressedProof,
    ) -> Result<()> {
        instructions::did::verify_recovery(
            ctx,
            did_string,
            new_key_commitment,
            guardian_attestations,
            recovery_proof,
        )
    }

    // ========================================================================
    // Policy Instructions
    // ========================================================================

    /// Update merchant whitelist for a card
    pub fn update_merchant_whitelist(
        ctx: Context<UpdateMerchantWhitelist>,
        card_id: [u8; 32],
        merchants_to_add: Vec<[u8; 32]>,
        merchants_to_remove: Vec<[u8; 32]>,
        proof: CompressedProof,
    ) -> Result<()> {
        instructions::policy::update_merchant_whitelist(
            ctx,
            card_id,
            merchants_to_add,
            merchants_to_remove,
            proof,
        )
    }

    /// Update MCC (Merchant Category Code) whitelist
    pub fn update_mcc_whitelist(
        ctx: Context<UpdateMccWhitelist>,
        card_id: [u8; 32],
        mcc_codes_to_add: Vec<u16>,
        mcc_codes_to_remove: Vec<u16>,
        proof: CompressedProof,
    ) -> Result<()> {
        instructions::policy::update_mcc_whitelist(
            ctx,
            card_id,
            mcc_codes_to_add,
            mcc_codes_to_remove,
            proof,
        )
    }

    // ========================================================================
    // Velocity Reset Instructions
    // ========================================================================

    /// Reset daily spending counters (called by cron)
    pub fn reset_daily_spending(
        ctx: Context<ResetDailySpending>,
        card_ids: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::velocity::reset_daily_spending(ctx, card_ids)
    }

    /// Reset monthly spending counters (called by cron)
    pub fn reset_monthly_spending(
        ctx: Context<ResetMonthlySpending>,
        card_ids: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::velocity::reset_monthly_spending(ctx, card_ids)
    }
}

// ============================================================================
// Account Contexts
// ============================================================================

#[derive(Accounts)]
pub struct CreateCompressedCard<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The owner's DID commitment account
    /// CHECK: Verified via commitment hash
    pub owner_did_account: AccountInfo<'info>,

    /// Light Protocol system program
    /// CHECK: Verified by address
    pub light_system_program: AccountInfo<'info>,

    /// Light Protocol registered program PDA
    /// CHECK: Verified by Light Protocol
    pub registered_program_pda: AccountInfo<'info>,

    /// Merkle tree for compressed state
    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,

    /// Nullifier queue
    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub nullifier_queue: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateCardBalance<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub nullifier_queue: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RecordSpending<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub nullifier_queue: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct FreezeCard<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UnfreezeCard<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateCardLimits<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct StoreDIDCommitment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub nullifier_queue: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateDIDCommitment<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct VerifyRecovery<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateMerchantWhitelist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateMccWhitelist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ResetDailySpending<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ResetMonthlySpending<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verified by Light Protocol
    pub light_system_program: AccountInfo<'info>,

    /// CHECK: Verified by Light Protocol
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,
}

// ============================================================================
// Shared Types
// ============================================================================

/// Compressed proof for state transitions
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CompressedProof {
    pub a: [u8; 64],
    pub b: [u8; 128],
    pub c: [u8; 64],
}

/// Reason for freezing a card
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum FreezeReason {
    FraudDetected,
    UserRequest,
    ComplianceHold,
    VelocityBreach,
    MerchantBlock,
}

/// Guardian attestation for recovery
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GuardianAttestation {
    pub guardian_did_commitment: [u8; 32],
    pub attestation_hash: [u8; 32],
    pub signature: [u8; 64],
    pub timestamp: i64,
}
