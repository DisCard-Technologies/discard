// Source of Funds Circuit
//
// Proves that funds originate from an approved source set using Merkle
// inclusion proof. The verifier only sees the Merkle root of approved
// sources — the actual source remains private.
//
// Public Inputs:
// - approved_root: Merkle root of the set of approved fund sources (public)
// - commitment: Pedersen commitment to the fund source identifier (public)
//
// Private Witnesses:
// - source_id: The actual fund source identifier (private)
// - randomness: Randomness for the Pedersen commitment (private)
// - merkle_path: Sibling hashes along the Merkle path (private)
// - merkle_indices: Left/right indicators for each path step (private)
//
// The proof demonstrates:
// 1. source_id is in the approved sources Merkle tree (Merkle inclusion)
// 2. commitment = Pedersen(source_id, randomness)
//
// Merkle tree depth is fixed at 8 (supports up to 256 approved sources)

use dep::std;

global MERKLE_DEPTH: u32 = 8;

fn main(
    // Private witnesses
    source_id: Field,
    randomness: Field,
    merkle_path: [Field; 8],
    merkle_indices: [Field; 8],  // 0 = left, 1 = right

    // Public inputs
    approved_root: pub Field,
    commitment: pub Field
) {
    // ========== Constraint 1: Merkle Inclusion Proof ==========
    // Verify that source_id is a leaf in the approved sources tree
    let leaf = std::hash::pedersen_hash([source_id]);
    let mut current = leaf;

    for i in 0..8 {
        // Each index must be 0 or 1
        assert((merkle_indices[i] as u64 == 0) | (merkle_indices[i] as u64 == 1));

        if merkle_indices[i] as u64 == 0 {
            // Current node is on the left, sibling on the right
            current = std::hash::pedersen_hash([current, merkle_path[i]]);
        } else {
            // Current node is on the right, sibling on the left
            current = std::hash::pedersen_hash([merkle_path[i], current]);
        }
    }

    // Verify computed root matches the approved root
    assert(current == approved_root);

    // ========== Constraint 2: Commitment Verification ==========
    let computed_commitment = std::hash::pedersen_hash([source_id, randomness]);
    assert(computed_commitment == commitment);
}

// Tests

#[test]
fn test_valid_source() {
    // Build a simple Merkle tree with 2 leaves for testing
    let source_id: Field = 12345;
    let other_source: Field = 67890;
    let randomness: Field = 42;

    let leaf_0 = std::hash::pedersen_hash([source_id]);
    let leaf_1 = std::hash::pedersen_hash([other_source]);

    // Build tree bottom-up (depth 8, pad with zeros)
    let level_1 = std::hash::pedersen_hash([leaf_0, leaf_1]);
    // Remaining levels pair with self (padded tree)
    let level_2 = std::hash::pedersen_hash([level_1, level_1]);
    let level_3 = std::hash::pedersen_hash([level_2, level_2]);
    let level_4 = std::hash::pedersen_hash([level_3, level_3]);
    let level_5 = std::hash::pedersen_hash([level_4, level_4]);
    let level_6 = std::hash::pedersen_hash([level_5, level_5]);
    let level_7 = std::hash::pedersen_hash([level_6, level_6]);
    let root = std::hash::pedersen_hash([level_7, level_7]);

    // Merkle path for leaf_0 (leftmost leaf)
    let merkle_path = [leaf_1, level_1, level_2, level_3, level_4, level_5, level_6, level_7];
    let merkle_indices = [0, 0, 0, 0, 0, 0, 0, 0]; // all left

    let commitment = std::hash::pedersen_hash([source_id, randomness]);

    main(source_id, randomness, merkle_path, merkle_indices, root, commitment);
}

#[test(should_fail)]
fn test_invalid_source() {
    // Try to prove a source that isn't in the tree
    let fake_source: Field = 99999;
    let real_source: Field = 12345;
    let other_source: Field = 67890;
    let randomness: Field = 42;

    let leaf_0 = std::hash::pedersen_hash([real_source]);
    let leaf_1 = std::hash::pedersen_hash([other_source]);

    let level_1 = std::hash::pedersen_hash([leaf_0, leaf_1]);
    let level_2 = std::hash::pedersen_hash([level_1, level_1]);
    let level_3 = std::hash::pedersen_hash([level_2, level_2]);
    let level_4 = std::hash::pedersen_hash([level_3, level_3]);
    let level_5 = std::hash::pedersen_hash([level_4, level_4]);
    let level_6 = std::hash::pedersen_hash([level_5, level_5]);
    let level_7 = std::hash::pedersen_hash([level_6, level_6]);
    let root = std::hash::pedersen_hash([level_7, level_7]);

    let merkle_path = [leaf_1, level_1, level_2, level_3, level_4, level_5, level_6, level_7];
    let merkle_indices = [0, 0, 0, 0, 0, 0, 0, 0];

    let commitment = std::hash::pedersen_hash([fake_source, randomness]);

    // Should fail — fake_source is not in the tree
    main(fake_source, randomness, merkle_path, merkle_indices, root, commitment);
}
