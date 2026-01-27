//! Audit Anchor State
//!
//! On-chain PDA that stores the Merkle root of a batch of audit log entries.
//! Used for tamper-evident anchoring of off-chain audit data to Solana.

use anchor_lang::prelude::*;

/// PDA seeds: [b"audit_anchor", authority.key(), &timestamp.to_le_bytes()]
#[account]
pub struct AuditAnchorState {
    /// The authority that submitted this anchor
    pub authority: Pubkey,

    /// SHA-256 Merkle root of the batch of audit event hashes
    pub merkle_root: [u8; 32],

    /// Number of audit entries included in this batch
    pub batch_size: u32,

    /// Unix timestamp (milliseconds) when this batch was anchored
    pub anchored_at: i64,

    /// Slot when anchor was committed
    pub anchor_slot: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl AuditAnchorState {
    /// Account discriminator (8) + pubkey (32) + merkle_root (32) + batch_size (4)
    /// + anchored_at (8) + anchor_slot (8) + bump (1)
    pub const SIZE: usize = 8 + 32 + 32 + 4 + 8 + 8 + 1;
}
