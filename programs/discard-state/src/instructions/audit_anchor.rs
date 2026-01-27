//! Audit Anchor Instruction
//!
//! Stores a SHA-256 Merkle root of audit log entries on-chain.
//! Called by the Convex cron batch anchoring pipeline.

use anchor_lang::prelude::*;

use crate::state::AuditAnchorState;

/// Anchor a batch of audit log entries by storing their Merkle root on-chain.
///
/// PDA seeds: [b"audit_anchor", authority.key(), &timestamp.to_le_bytes()]
pub fn anchor_audit_merkle_root(
    ctx: Context<AnchorAuditMerkleRoot>,
    merkle_root: [u8; 32],
    batch_size: u32,
    timestamp: i64,
) -> Result<()> {
    let anchor_state = &mut ctx.accounts.audit_anchor;

    anchor_state.authority = ctx.accounts.authority.key();
    anchor_state.merkle_root = merkle_root;
    anchor_state.batch_size = batch_size;
    anchor_state.anchored_at = timestamp;
    anchor_state.anchor_slot = Clock::get()?.slot;
    anchor_state.bump = ctx.bumps.audit_anchor;

    msg!(
        "Audit anchor created: batch_size={}, slot={}",
        batch_size,
        anchor_state.anchor_slot
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(merkle_root: [u8; 32], batch_size: u32, timestamp: i64)]
pub struct AnchorAuditMerkleRoot<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = AuditAnchorState::SIZE,
        seeds = [b"audit_anchor", authority.key().as_ref(), &timestamp.to_le_bytes()],
        bump,
    )]
    pub audit_anchor: Account<'info, AuditAnchorState>,

    pub system_program: Program<'info, System>,
}
