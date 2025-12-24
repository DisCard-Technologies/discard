//! DID commitment state for compressed PDAs

use anchor_lang::prelude::*;

/// Compressed DID commitment stored in Light Protocol Merkle tree
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct DIDCommitmentState {
    /// DID string hash (for lookup)
    pub did_hash: [u8; 32],

    /// Poseidon commitment hash of the DID document
    pub commitment_hash: [u8; 32],

    /// SHA-256 hash of the canonical DID document
    pub document_hash: [u8; 32],

    /// Number of verification methods in the DID document
    pub verification_method_count: u8,

    /// Recovery threshold (e.g., 2 for 2-of-3)
    pub recovery_threshold: u8,

    /// Number of active recovery guardians
    pub active_guardians_count: u8,

    /// DID status
    pub status: DIDStatus,

    /// Slot when last key rotation occurred
    pub last_key_rotation_slot: u64,

    /// Total number of key rotations
    pub key_rotation_count: u32,

    /// Slot when DID was created
    pub created_at_slot: u64,

    /// Slot when DID was last updated
    pub updated_at_slot: u64,
}

impl DIDCommitmentState {
    pub const SIZE: usize = 32 + 32 + 32 + 1 + 1 + 1 + 1 + 8 + 4 + 8 + 8;

    /// Check if recovery is possible
    pub fn can_recover(&self) -> bool {
        self.status == DIDStatus::Active &&
        self.active_guardians_count >= self.recovery_threshold
    }

    /// Apply key rotation
    pub fn rotate_key(
        &mut self,
        new_commitment_hash: [u8; 32],
        new_document_hash: [u8; 32],
        current_slot: u64,
    ) {
        self.commitment_hash = new_commitment_hash;
        self.document_hash = new_document_hash;
        self.key_rotation_count = self.key_rotation_count.saturating_add(1);
        self.last_key_rotation_slot = current_slot;
        self.updated_at_slot = current_slot;
    }

    /// Suspend the DID
    pub fn suspend(&mut self, current_slot: u64) {
        self.status = DIDStatus::Suspended;
        self.updated_at_slot = current_slot;
    }

    /// Revoke the DID (permanent)
    pub fn revoke(&mut self, current_slot: u64) {
        self.status = DIDStatus::Revoked;
        self.updated_at_slot = current_slot;
    }

    /// Reactivate a suspended DID
    pub fn reactivate(&mut self, current_slot: u64) -> Result<()> {
        require!(self.status == DIDStatus::Suspended, DIDError::CannotReactivate);
        self.status = DIDStatus::Active;
        self.updated_at_slot = current_slot;
        Ok(())
    }

    /// Update guardian count
    pub fn update_guardian_count(&mut self, count: u8, current_slot: u64) {
        self.active_guardians_count = count;
        self.updated_at_slot = current_slot;
    }
}

/// DID status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default)]
pub enum DIDStatus {
    #[default]
    Active,
    Suspended,
    Revoked,
}

/// Recovery guardian state (stored separately)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RecoveryGuardianState {
    /// DID hash this guardian is for
    pub did_hash: [u8; 32],

    /// Guardian's DID commitment
    pub guardian_did_commitment: [u8; 32],

    /// SAS attestation hash
    pub attestation_hash: [u8; 32],

    /// Guardian status
    pub status: GuardianStatus,

    /// Slot when guardian was added
    pub added_at_slot: u64,

    /// Slot when guardian was revoked (if revoked)
    pub revoked_at_slot: Option<u64>,
}

/// Guardian status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GuardianStatus {
    Active,
    Revoked,
    PendingAttestation,
}

/// DID-specific errors
#[error_code]
pub enum DIDError {
    #[msg("DID not found")]
    DIDNotFound,

    #[msg("DID is suspended")]
    DIDSuspended,

    #[msg("DID is revoked")]
    DIDRevoked,

    #[msg("Cannot reactivate DID in current status")]
    CannotReactivate,

    #[msg("Insufficient guardian attestations for recovery")]
    InsufficientAttestations,

    #[msg("Guardian not found")]
    GuardianNotFound,

    #[msg("Guardian already exists")]
    GuardianAlreadyExists,

    #[msg("Invalid recovery proof")]
    InvalidRecoveryProof,

    #[msg("Recovery threshold not met")]
    RecoveryThresholdNotMet,

    #[msg("Invalid DID format")]
    InvalidDIDFormat,

    #[msg("Commitment hash mismatch")]
    CommitmentMismatch,
}
