//! DID instruction handlers

use anchor_lang::prelude::*;
use crate::state::did::{DIDCommitmentState, DIDStatus, DIDError};
use crate::{
    StoreDIDCommitment, UpdateDIDCommitment, VerifyRecovery,
    CompressedProof, GuardianAttestation,
};

/// Store a DID commitment on-chain
pub fn store_did_commitment(
    ctx: Context<StoreDIDCommitment>,
    did_string: String,
    commitment_hash: [u8; 32],
    document_hash: [u8; 32],
    recovery_threshold: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_slot = clock.slot;

    // Hash the DID string for lookup
    let did_hash = hash_did_string(&did_string);

    // Create initial DID commitment state
    let did_state = DIDCommitmentState {
        did_hash,
        commitment_hash,
        document_hash,
        verification_method_count: 1, // Initial key
        recovery_threshold,
        active_guardians_count: 0,
        status: DIDStatus::Active,
        last_key_rotation_slot: 0,
        key_rotation_count: 0,
        created_at_slot: current_slot,
        updated_at_slot: current_slot,
    };

    // Serialize state
    let state_bytes = did_state.try_to_vec()?;

    // In production, call Light Protocol to create compressed account
    // light_sdk::compress_account(ctx.accounts.light_system_program, state_bytes, ...)?;

    msg!("Stored DID commitment: {}", did_string);
    msg!("Commitment hash: {:?}", commitment_hash);
    msg!("Recovery threshold: {}", recovery_threshold);

    Ok(())
}

/// Update DID commitment after key rotation
pub fn update_did_commitment(
    ctx: Context<UpdateDIDCommitment>,
    did_string: String,
    new_commitment_hash: [u8; 32],
    new_document_hash: [u8; 32],
    proof: CompressedProof,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_slot = clock.slot;

    // In production:
    // 1. Verify the proof
    // 2. Decompress current state
    // 3. Apply key rotation
    // 4. Recompress with new state

    msg!("Updated DID commitment: {}", did_string);
    msg!("New commitment hash: {:?}", new_commitment_hash);

    Ok(())
}

/// Verify a DID recovery using guardian attestations
pub fn verify_recovery(
    ctx: Context<VerifyRecovery>,
    did_string: String,
    new_key_commitment: [u8; 32],
    guardian_attestations: Vec<GuardianAttestation>,
    recovery_proof: CompressedProof,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_slot = clock.slot;

    // In production:
    // 1. Verify the recovery proof (ZK proof that threshold is met)
    // 2. Verify each guardian attestation
    // 3. Check that attestations are from valid guardians
    // 4. Check that threshold is met
    // 5. Apply key rotation with new key
    // 6. Emit recovery event

    let attestation_count = guardian_attestations.len();

    msg!("Recovery verification for DID: {}", did_string);
    msg!("Guardian attestations: {}", attestation_count);
    msg!("New key commitment: {:?}", new_key_commitment);

    // Verify each attestation
    for (i, attestation) in guardian_attestations.iter().enumerate() {
        msg!(
            "Attestation {}: guardian={:?}, timestamp={}",
            i,
            attestation.guardian_did_commitment,
            attestation.timestamp
        );

        // In production, verify signature
        // verify_signature(attestation.guardian_did_commitment, attestation.attestation_hash, attestation.signature)?;
    }

    Ok(())
}

/// Hash a DID string to 32 bytes
fn hash_did_string(did: &str) -> [u8; 32] {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    did.hash(&mut hasher);
    let hash = hasher.finish();

    // Expand to 32 bytes (placeholder - use proper hash in production)
    let mut result = [0u8; 32];
    result[0..8].copy_from_slice(&hash.to_le_bytes());
    result[8..16].copy_from_slice(&hash.to_be_bytes());
    result[16..24].copy_from_slice(&hash.to_le_bytes());
    result[24..32].copy_from_slice(&hash.to_be_bytes());
    result
}
