// Agent Authorization Circuit
//
// Proves that an agent is authorized to act on behalf of a wallet
// without revealing the wallet identity.
//
// Public Inputs:
// - agent_pubkey: The agent's public key (identifies the agent)
// - permission_hash: Hash of the agent's permissions
// - merkle_root: Root of the agent registry Merkle tree
// - nullifier_hash: Unique nullifier for this operation (prevents replay)
//
// Private Witnesses:
// - wallet_pubkey: The owner's wallet public key (kept private)
// - permissions_raw: Raw permission field elements (kept private)
// - nonce: Random nonce used in commitment (kept private)
// - merkle_path: Merkle proof siblings (kept private)
// - merkle_indices: Left/right path indicators (kept private)
// - operation_nonce: Per-operation random nonce (kept private)
//
// The proof demonstrates:
// 1. Agent commitment = Poseidon(agent_pubkey, wallet_pubkey, permission_hash, nonce)
// 2. permission_hash = Poseidon(permissions_raw[0..3])
// 3. Commitment is a valid leaf in the Merkle tree with given root
// 4. nullifier_hash = Poseidon(commitment, operation_nonce)
//
// @see https://github.com/solana-foundation/noir-examples

use dep::std;

// Merkle tree depth for Light Protocol state trees
global TREE_DEPTH: u32 = 26;

// Main circuit function
fn main(
    // Private witnesses
    wallet_pubkey: Field,                     // Owner wallet key (private)
    permissions_raw: [Field; 4],              // Raw permission elements (private)
    nonce: Field,                             // Commitment nonce (private)
    merkle_path: [Field; TREE_DEPTH],         // Merkle proof siblings (private)
    merkle_indices: [Field; TREE_DEPTH],      // Path indicators (private)
    operation_nonce: Field,                   // Per-operation nonce (private)

    // Public inputs
    agent_pubkey: pub Field,                  // Agent public key (public)
    permission_hash: pub Field,              // Permission hash (public)
    merkle_root: pub Field,                  // Merkle tree root (public)
    nullifier_hash: pub Field                // Operation nullifier (public)
) {
    // ========== Constraint 1: Permission Hash Verification ==========
    // Prove that permission_hash matches the Poseidon hash of raw permissions
    let computed_perm_hash = std::hash::poseidon::bn254::hash_4(permissions_raw);
    assert(computed_perm_hash == permission_hash);

    // ========== Constraint 2: Commitment Verification ==========
    // Prove commitment = Poseidon(agent_pubkey, wallet_pubkey, permission_hash, nonce)
    let commitment_inputs = [agent_pubkey, wallet_pubkey, permission_hash, nonce];
    let commitment = std::hash::poseidon::bn254::hash_4(commitment_inputs);

    // ========== Constraint 3: Merkle Membership ==========
    // Prove the commitment is a valid leaf in the Merkle tree
    let mut current = commitment;
    for i in 0..TREE_DEPTH {
        let sibling = merkle_path[i];
        let index = merkle_indices[i];

        // index should be 0 or 1
        assert((index == 0) | (index == 1));

        // Hash pair in correct order based on path index
        let left = if index == 0 { current } else { sibling };
        let right = if index == 0 { sibling } else { current };
        current = std::hash::pedersen_hash([left, right]);
    }
    assert(current == merkle_root);

    // ========== Constraint 4: Nullifier Derivation ==========
    // Prove nullifier_hash = Poseidon(commitment, operation_nonce)
    let computed_nullifier = std::hash::pedersen_hash([commitment, operation_nonce]);
    assert(computed_nullifier == nullifier_hash);
}

// ============================================================================
// Tests
// ============================================================================

#[test]
fn test_valid_agent_authorization() {
    // Setup test values
    let agent_pubkey: Field = 12345;
    let wallet_pubkey: Field = 67890;
    let nonce: Field = 11111;
    let permissions_raw: [Field; 4] = [1, 2, 3, 4];
    let operation_nonce: Field = 99999;

    // Compute expected values
    let permission_hash = std::hash::poseidon::bn254::hash_4(permissions_raw);
    let commitment_inputs = [agent_pubkey, wallet_pubkey, permission_hash, nonce];
    let commitment = std::hash::poseidon::bn254::hash_4(commitment_inputs);
    let nullifier_hash = std::hash::pedersen_hash([commitment, operation_nonce]);

    // Build a trivial Merkle tree (leaf is root for depth-0 equivalent)
    // For testing, we compute the root from the commitment
    let mut merkle_path: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let mut merkle_indices: [Field; TREE_DEPTH] = [0; TREE_DEPTH];

    // Compute the Merkle root by hashing up the tree with zero siblings
    let mut current = commitment;
    for i in 0..TREE_DEPTH {
        current = std::hash::pedersen_hash([current, merkle_path[i]]);
    }
    let merkle_root = current;

    // This should pass
    main(
        wallet_pubkey,
        permissions_raw,
        nonce,
        merkle_path,
        merkle_indices,
        operation_nonce,
        agent_pubkey,
        permission_hash,
        merkle_root,
        nullifier_hash
    );
}

#[test(should_fail)]
fn test_wrong_wallet() {
    // Setup with correct values
    let agent_pubkey: Field = 12345;
    let wallet_pubkey: Field = 67890;
    let wrong_wallet: Field = 55555;
    let nonce: Field = 11111;
    let permissions_raw: [Field; 4] = [1, 2, 3, 4];
    let operation_nonce: Field = 99999;

    // Compute with CORRECT wallet
    let permission_hash = std::hash::poseidon::bn254::hash_4(permissions_raw);
    let commitment_inputs = [agent_pubkey, wallet_pubkey, permission_hash, nonce];
    let commitment = std::hash::poseidon::bn254::hash_4(commitment_inputs);
    let nullifier_hash = std::hash::pedersen_hash([commitment, operation_nonce]);

    let merkle_path: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let merkle_indices: [Field; TREE_DEPTH] = [0; TREE_DEPTH];

    let mut current = commitment;
    for i in 0..TREE_DEPTH {
        current = std::hash::pedersen_hash([current, merkle_path[i]]);
    }
    let merkle_root = current;

    // This should fail - using wrong wallet as witness
    main(
        wrong_wallet,       // Wrong wallet
        permissions_raw,
        nonce,
        merkle_path,
        merkle_indices,
        operation_nonce,
        agent_pubkey,
        permission_hash,
        merkle_root,
        nullifier_hash
    );
}

#[test(should_fail)]
fn test_wrong_permissions() {
    let agent_pubkey: Field = 12345;
    let wallet_pubkey: Field = 67890;
    let nonce: Field = 11111;
    let permissions_raw: [Field; 4] = [1, 2, 3, 4];
    let wrong_permissions: [Field; 4] = [9, 9, 9, 9];
    let operation_nonce: Field = 99999;

    let permission_hash = std::hash::poseidon::bn254::hash_4(permissions_raw);
    let commitment_inputs = [agent_pubkey, wallet_pubkey, permission_hash, nonce];
    let commitment = std::hash::poseidon::bn254::hash_4(commitment_inputs);
    let nullifier_hash = std::hash::pedersen_hash([commitment, operation_nonce]);

    let merkle_path: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let merkle_indices: [Field; TREE_DEPTH] = [0; TREE_DEPTH];

    let mut current = commitment;
    for i in 0..TREE_DEPTH {
        current = std::hash::pedersen_hash([current, merkle_path[i]]);
    }
    let merkle_root = current;

    // This should fail - wrong permissions don't match permission_hash
    main(
        wallet_pubkey,
        wrong_permissions,  // Wrong permissions
        nonce,
        merkle_path,
        merkle_indices,
        operation_nonce,
        agent_pubkey,
        permission_hash,
        merkle_root,
        nullifier_hash
    );
}
