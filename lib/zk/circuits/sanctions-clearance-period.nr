// Sanctions Clearance Period Circuit
//
// Proves that a sanctions screening occurred within a specified time window
// (e.g., last 24 hours) without revealing the exact screening timestamp.
//
// Public Inputs:
// - current_time: Current timestamp for freshness check (public)
// - max_age: Maximum age of screening in same time units (public)
// - commitment: Pedersen commitment to the screening timestamp (public)
//
// Private Witnesses:
// - screening_time: When the sanctions screening occurred (private)
// - randomness: Randomness for the Pedersen commitment (private)
//
// The proof demonstrates:
// 1. screening_time <= current_time (screening happened in the past)
// 2. current_time - screening_time <= max_age (screening is recent enough)
// 3. commitment = Pedersen(screening_time, randomness)

use dep::std;

fn main(
    // Private witnesses
    screening_time: Field,
    randomness: Field,

    // Public inputs
    current_time: pub Field,
    max_age: pub Field,
    commitment: pub Field
) {
    // ========== Constraint 1: Screening happened in the past ==========
    assert(screening_time as u64 <= current_time as u64);

    // ========== Constraint 2: Screening is within the allowed window ==========
    let age = current_time as u64 - screening_time as u64;
    assert(age <= max_age as u64);

    // ========== Constraint 3: Commitment Verification ==========
    let computed_commitment = std::hash::pedersen_hash([screening_time, randomness]);
    assert(computed_commitment == commitment);
}

// Tests

#[test]
fn test_recent_screening() {
    // Screening 12 hours ago, max age 24 hours
    let current_time: Field = 1700000000;
    let screening_time: Field = 1699956800; // 12h ago (43200s)
    let max_age: Field = 86400; // 24h in seconds
    let randomness: Field = 55;

    let commitment = std::hash::pedersen_hash([screening_time, randomness]);
    main(screening_time, randomness, current_time, max_age, commitment);
}

#[test]
fn test_just_at_boundary() {
    // Screening exactly 24h ago
    let current_time: Field = 1700000000;
    let screening_time: Field = 1699913600; // exactly 24h ago
    let max_age: Field = 86400;
    let randomness: Field = 33;

    let commitment = std::hash::pedersen_hash([screening_time, randomness]);
    main(screening_time, randomness, current_time, max_age, commitment);
}

#[test(should_fail)]
fn test_stale_screening() {
    // Screening 48 hours ago, max age 24 hours
    let current_time: Field = 1700000000;
    let screening_time: Field = 1699827200; // 48h ago
    let max_age: Field = 86400; // 24h
    let randomness: Field = 55;

    let commitment = std::hash::pedersen_hash([screening_time, randomness]);
    main(screening_time, randomness, current_time, max_age, commitment);
}

#[test(should_fail)]
fn test_future_screening() {
    // Screening in the future (invalid)
    let current_time: Field = 1700000000;
    let screening_time: Field = 1700100000; // future
    let max_age: Field = 86400;
    let randomness: Field = 55;

    let commitment = std::hash::pedersen_hash([screening_time, randomness]);
    main(screening_time, randomness, current_time, max_age, commitment);
}
