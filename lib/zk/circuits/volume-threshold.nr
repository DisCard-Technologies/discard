// Volume Threshold Circuit
//
// Proves that cumulative trading volume is above or below a threshold.
// Direction is configurable via public input (1 = above, 0 = below).
//
// Public Inputs:
// - threshold: Volume threshold to prove against (public)
// - direction: 1 = prove volume >= threshold, 0 = prove volume < threshold (public)
// - commitment: Pedersen commitment to the cumulative volume (public)
//
// Private Witnesses:
// - volume: Actual cumulative volume (private)
// - randomness: Randomness for the Pedersen commitment (private)
//
// The proof demonstrates:
// 1. If direction == 1: volume >= threshold (above)
// 2. If direction == 0: volume < threshold (below)
// 3. commitment = Pedersen(volume, randomness)

use dep::std;

fn main(
    // Private witnesses
    volume: Field,
    randomness: Field,

    // Public inputs
    threshold: pub Field,
    direction: pub Field,  // 1 = above, 0 = below
    commitment: pub Field
) {
    // ========== Constraint 1: Direction must be 0 or 1 ==========
    assert((direction as u64 == 0) | (direction as u64 == 1));

    // ========== Constraint 2: Volume vs Threshold ==========
    if direction as u64 == 1 {
        // Prove volume >= threshold (above)
        assert(volume as u64 >= threshold as u64);
    } else {
        // Prove volume < threshold (below)
        assert((volume as u64) < (threshold as u64));
    }

    // ========== Constraint 3: Commitment Verification ==========
    let computed_commitment = std::hash::pedersen_hash([volume, randomness]);
    assert(computed_commitment == commitment);
}

// Tests

#[test]
fn test_above_threshold() {
    let volume: Field = 5000000; // $50,000
    let threshold: Field = 1000000; // $10,000
    let direction: Field = 1; // above
    let randomness: Field = 88;

    let commitment = std::hash::pedersen_hash([volume, randomness]);
    main(volume, randomness, threshold, direction, commitment);
}

#[test]
fn test_below_threshold() {
    let volume: Field = 500000; // $5,000
    let threshold: Field = 1000000; // $10,000
    let direction: Field = 0; // below
    let randomness: Field = 88;

    let commitment = std::hash::pedersen_hash([volume, randomness]);
    main(volume, randomness, threshold, direction, commitment);
}

#[test]
fn test_exact_above() {
    let volume: Field = 1000000;
    let threshold: Field = 1000000;
    let direction: Field = 1; // above (>= threshold)
    let randomness: Field = 88;

    let commitment = std::hash::pedersen_hash([volume, randomness]);
    main(volume, randomness, threshold, direction, commitment);
}

#[test(should_fail)]
fn test_above_fails_when_below() {
    let volume: Field = 500000; // $5,000
    let threshold: Field = 1000000; // $10,000
    let direction: Field = 1; // claiming above, but actually below
    let randomness: Field = 88;

    let commitment = std::hash::pedersen_hash([volume, randomness]);
    main(volume, randomness, threshold, direction, commitment);
}

#[test(should_fail)]
fn test_below_fails_when_above() {
    let volume: Field = 5000000; // $50,000
    let threshold: Field = 1000000; // $10,000
    let direction: Field = 0; // claiming below, but actually above
    let randomness: Field = 88;

    let commitment = std::hash::pedersen_hash([volume, randomness]);
    main(volume, randomness, threshold, direction, commitment);
}

#[test(should_fail)]
fn test_invalid_direction() {
    let volume: Field = 5000000;
    let threshold: Field = 1000000;
    let direction: Field = 2; // invalid direction
    let randomness: Field = 88;

    let commitment = std::hash::pedersen_hash([volume, randomness]);
    main(volume, randomness, threshold, direction, commitment);
}
