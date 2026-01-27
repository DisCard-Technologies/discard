// Reserve Proof Circuit
//
// Proves that a balance is greater than or equal to a threshold
// without revealing the actual amount. Used for institutional
// proof-of-reserves compliance.
//
// Public Inputs:
// - threshold: Minimum balance to prove (public)
// - commitment: Pedersen commitment to the balance (public)
//
// Private Witnesses:
// - balance: The actual balance (private)
// - randomness: Randomness used in the Pedersen commitment (private)
//
// The proof demonstrates:
// 1. balance >= threshold
// 2. commitment = Pedersen(balance, randomness)

use dep::std;

fn main(
    // Private witnesses
    balance: Field,
    randomness: Field,

    // Public inputs
    threshold: pub Field,
    commitment: pub Field
) {
    // ========== Constraint 1: Balance >= Threshold ==========
    assert(balance as u64 >= threshold as u64);

    // ========== Constraint 2: Commitment Verification ==========
    let computed_commitment = std::hash::pedersen_hash([balance, randomness]);
    assert(computed_commitment == commitment);
}

// Tests

#[test]
fn test_valid_reserve() {
    let balance: Field = 500000; // $5,000.00
    let threshold: Field = 100000; // $1,000.00
    let randomness: Field = 42;

    let commitment = std::hash::pedersen_hash([balance, randomness]);
    main(balance, randomness, threshold, commitment);
}

#[test]
fn test_exact_threshold() {
    let balance: Field = 100000;
    let threshold: Field = 100000;
    let randomness: Field = 77;

    let commitment = std::hash::pedersen_hash([balance, randomness]);
    main(balance, randomness, threshold, commitment);
}

#[test(should_fail)]
fn test_below_threshold() {
    let balance: Field = 50000; // $500.00
    let threshold: Field = 100000; // $1,000.00
    let randomness: Field = 42;

    let commitment = std::hash::pedersen_hash([balance, randomness]);
    main(balance, randomness, threshold, commitment);
}

#[test(should_fail)]
fn test_wrong_commitment() {
    let balance: Field = 500000;
    let threshold: Field = 100000;
    let randomness: Field = 42;

    let wrong_commitment = std::hash::pedersen_hash([balance, 999]);
    main(balance, randomness, threshold, wrong_commitment);
}
