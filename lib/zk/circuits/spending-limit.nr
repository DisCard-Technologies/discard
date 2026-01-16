// Spending Limit Circuit
//
// Proves that a user's balance is greater than or equal to a transaction amount
// without revealing the actual balance.
//
// Public Inputs:
// - amount: The transaction amount (what the user wants to spend)
// - commitment: Pedersen commitment to the balance
//
// Private Witnesses:
// - balance: The actual balance (kept private)
// - randomness: Randomness used in the commitment (kept private)
//
// The proof demonstrates:
// 1. balance >= amount (spending is valid)
// 2. commitment = Pedersen(balance, randomness) (balance is authentic)
//
// @see https://github.com/solana-foundation/noir-examples

use dep::std;

// Main circuit function
fn main(
    // Private witnesses
    balance: Field,           // Actual balance (private)
    randomness: Field,        // Commitment randomness (private)

    // Public inputs
    amount: pub Field,        // Transaction amount (public)
    commitment: pub Field     // Balance commitment (public)
) {
    // ========== Constraint 1: Balance >= Amount ==========
    // Prove that the balance is sufficient for the transaction
    // This uses a range proof internally
    assert(balance as u64 >= amount as u64);

    // ========== Constraint 2: Commitment Verification ==========
    // Prove that the commitment correctly binds to the balance
    // commitment = Pedersen(balance || randomness)
    let computed_commitment = std::hash::pedersen_hash([balance, randomness]);
    assert(computed_commitment == commitment);
}

// Test function
#[test]
fn test_valid_spending() {
    // Balance: 10000 (e.g., $100.00 in cents)
    // Amount: 5000 (e.g., $50.00 in cents)
    let balance: Field = 10000;
    let amount: Field = 5000;
    let randomness: Field = 12345;

    // Generate commitment
    let commitment = std::hash::pedersen_hash([balance, randomness]);

    // This should pass - balance >= amount
    main(balance, randomness, amount, commitment);
}

#[test(should_fail)]
fn test_insufficient_balance() {
    // Balance: 3000 (e.g., $30.00 in cents)
    // Amount: 5000 (e.g., $50.00 in cents)
    let balance: Field = 3000;
    let amount: Field = 5000;
    let randomness: Field = 12345;

    // Generate commitment
    let commitment = std::hash::pedersen_hash([balance, randomness]);

    // This should fail - balance < amount
    main(balance, randomness, amount, commitment);
}

#[test(should_fail)]
fn test_wrong_commitment() {
    // Balance: 10000
    // Amount: 5000
    let balance: Field = 10000;
    let amount: Field = 5000;
    let randomness: Field = 12345;

    // Generate WRONG commitment (different randomness)
    let wrong_commitment = std::hash::pedersen_hash([balance, 99999]);

    // This should fail - commitment doesn't match
    main(balance, randomness, amount, wrong_commitment);
}
