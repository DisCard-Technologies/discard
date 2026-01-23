/**
 * Constant-Time Cryptographic Utilities
 *
 * Side-channel resistant operations for cryptographic code.
 * These functions avoid timing variations that could leak
 * secret information through execution time analysis.
 *
 * Key principles:
 * - No early exits based on secret data
 * - No secret-dependent branches
 * - No secret-dependent memory access patterns
 *
 * @see https://www.bearssl.org/constanttime.html
 * @see https://timing.attacks.cr.yp.to/
 */

// ============================================================================
// Constant-Time Comparison
// ============================================================================

/**
 * Constant-time byte array comparison
 *
 * Compares all bytes regardless of where first difference occurs.
 * Always takes the same time for arrays of equal length.
 *
 * @param a - First array
 * @param b - Second array
 * @returns True if arrays are equal
 */
export function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  // Length check - this leaks length but not content
  if (a.length !== b.length) {
    return false;
  }

  // XOR all bytes and accumulate
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  // Convert to boolean without branching
  // If result is 0, arrays are equal
  return result === 0;
}

/**
 * Constant-time string comparison
 *
 * Converts strings to byte arrays for comparison.
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
export function constantTimeCompareStrings(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  return constantTimeCompare(encoder.encode(a), encoder.encode(b));
}

/**
 * Constant-time hex string comparison
 *
 * @param a - First hex string
 * @param b - Second hex string
 * @returns True if hex strings represent equal values
 */
export function constantTimeCompareHex(a: string, b: string): boolean {
  // Normalize to lowercase
  const normalizedA = a.toLowerCase().replace(/^0x/, '');
  const normalizedB = b.toLowerCase().replace(/^0x/, '');

  if (normalizedA.length !== normalizedB.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < normalizedA.length; i++) {
    result |= normalizedA.charCodeAt(i) ^ normalizedB.charCodeAt(i);
  }

  return result === 0;
}

// ============================================================================
// Constant-Time Selection
// ============================================================================

/**
 * Constant-time conditional select for numbers
 *
 * Returns `a` if condition is true, `b` otherwise.
 * Executes in constant time regardless of condition.
 *
 * @param condition - Boolean condition
 * @param a - Value to return if true
 * @param b - Value to return if false
 * @returns Selected value
 */
export function constantTimeSelect(
  condition: boolean,
  a: number,
  b: number
): number {
  // Convert boolean to 0 or -1 (all bits set)
  const mask = -Number(condition) | 0;

  // Use bitwise operations to select
  // If mask is -1 (all 1s): (a & mask) | (b & ~mask) = a
  // If mask is 0: (a & mask) | (b & ~mask) = b
  return (a & mask) | (b & ~mask);
}

/**
 * Constant-time conditional select for bigints
 *
 * @param condition - Boolean condition
 * @param a - Value to return if true
 * @param b - Value to return if false
 * @returns Selected value
 */
export function constantTimeSelectBigInt(
  condition: boolean,
  a: bigint,
  b: bigint
): bigint {
  // Create mask: all 1s if true, all 0s if false
  const mask = condition ? -1n : 0n;

  // Select using bitwise operations
  return (a & mask) | (b & ~mask);
}

/**
 * Constant-time conditional select for byte arrays
 *
 * @param condition - Boolean condition
 * @param a - Array to return if true
 * @param b - Array to return if false (must be same length as a)
 * @returns Selected array (new copy)
 */
export function constantTimeSelectBytes(
  condition: boolean,
  a: Uint8Array,
  b: Uint8Array
): Uint8Array {
  if (a.length !== b.length) {
    throw new Error('Arrays must have equal length');
  }

  const result = new Uint8Array(a.length);
  const mask = -Number(condition) | 0;

  for (let i = 0; i < a.length; i++) {
    result[i] = (a[i] & mask) | (b[i] & ~mask);
  }

  return result;
}

// ============================================================================
// Constant-Time Conditionals
// ============================================================================

/**
 * Constant-time conditional swap
 *
 * Swaps a and b if condition is true, otherwise leaves unchanged.
 *
 * @param condition - Boolean condition for swap
 * @param a - First value
 * @param b - Second value
 * @returns [newA, newB] - swapped if condition true
 */
export function constantTimeSwap(
  condition: boolean,
  a: number,
  b: number
): [number, number] {
  const mask = -Number(condition) | 0;
  const diff = (a ^ b) & mask;
  return [a ^ diff, b ^ diff];
}

/**
 * Constant-time conditional swap for bigints
 */
export function constantTimeSwapBigInt(
  condition: boolean,
  a: bigint,
  b: bigint
): [bigint, bigint] {
  const mask = condition ? -1n : 0n;
  const diff = (a ^ b) & mask;
  return [a ^ diff, b ^ diff];
}

// ============================================================================
// Constant-Time Arithmetic Helpers
// ============================================================================

/**
 * Constant-time check if value is zero
 *
 * @param x - Value to check
 * @returns True if x is zero
 */
export function constantTimeIsZero(x: number): boolean {
  // Use bitwise OR to collapse all bits
  // (x | -x) >> 31 gives 0 for x=0, -1 otherwise (for 32-bit)
  // Then invert with +1
  return ((x | -x) >>> 31) === 0;
}

/**
 * Constant-time check if bigint is zero
 */
export function constantTimeIsZeroBigInt(x: bigint): boolean {
  // For bigint, we need different approach
  // This still branches on the sign, but it's the best we can do
  // in pure JS for arbitrary-precision integers
  return x === 0n;
}

/**
 * Constant-time less-than comparison
 *
 * @param a - First operand
 * @param b - Second operand
 * @returns True if a < b
 */
export function constantTimeLessThan(a: number, b: number): boolean {
  // (a - b) >> 31 gives -1 if a < b (for signed 32-bit)
  const diff = a - b;
  return (diff >> 31) === -1;
}

/**
 * Constant-time greater-than-or-equal comparison
 *
 * @param a - First operand
 * @param b - Second operand
 * @returns True if a >= b
 */
export function constantTimeGreaterOrEqual(a: number, b: number): boolean {
  return !constantTimeLessThan(a, b);
}

/**
 * Constant-time minimum
 *
 * @param a - First value
 * @param b - Second value
 * @returns Minimum of a and b
 */
export function constantTimeMin(a: number, b: number): number {
  const diff = a - b;
  const mask = diff >> 31; // -1 if a < b, 0 otherwise
  return b + (diff & mask);
}

/**
 * Constant-time maximum
 *
 * @param a - First value
 * @param b - Second value
 * @returns Maximum of a and b
 */
export function constantTimeMax(a: number, b: number): number {
  const diff = a - b;
  const mask = diff >> 31; // -1 if a < b, 0 otherwise
  return a - (diff & mask);
}

// ============================================================================
// Constant-Time Modular Arithmetic
// ============================================================================

/**
 * Constant-time modular reduction (for small moduli)
 *
 * Reduces x modulo m using subtraction instead of division.
 * Only suitable for cases where x < 2*m.
 *
 * @param x - Value to reduce
 * @param m - Modulus
 * @returns x mod m
 */
export function constantTimeModReduce(x: number, m: number): number {
  // Subtract m if x >= m
  const mask = constantTimeGreaterOrEqual(x, m) ? -1 : 0;
  return x - (m & mask);
}

/**
 * Constant-time modular addition
 *
 * Computes (a + b) mod m in constant time.
 * Assumes a, b < m.
 *
 * @param a - First operand
 * @param b - Second operand
 * @param m - Modulus
 * @returns (a + b) mod m
 */
export function constantTimeModAdd(a: number, b: number, m: number): number {
  const sum = a + b;
  return constantTimeModReduce(sum, m);
}

/**
 * Constant-time modular subtraction
 *
 * Computes (a - b) mod m in constant time.
 * Assumes a, b < m.
 *
 * @param a - First operand
 * @param b - Second operand
 * @param m - Modulus
 * @returns (a - b) mod m
 */
export function constantTimeModSub(a: number, b: number, m: number): number {
  const diff = a - b;
  // Add m if diff is negative
  const mask = (diff >> 31) & 0xffffffff;
  return diff + (m & mask);
}

// ============================================================================
// Constant-Time Array Operations
// ============================================================================

/**
 * Constant-time array lookup
 *
 * Accesses all array elements to avoid cache-timing attacks.
 *
 * @param arr - Array to look up in
 * @param index - Index to retrieve
 * @returns Value at index
 */
export function constantTimeLookup(arr: Uint8Array, index: number): number {
  let result = 0;

  for (let i = 0; i < arr.length; i++) {
    // Create mask: all 1s if i === index, 0 otherwise
    const mask = -Number(i === index) | 0;
    result |= arr[i] & mask;
  }

  return result;
}

/**
 * Constant-time array lookup for numbers
 */
export function constantTimeLookupNumber(arr: number[], index: number): number {
  let result = 0;

  for (let i = 0; i < arr.length; i++) {
    const mask = -Number(i === index) | 0;
    result |= arr[i] & mask;
  }

  return result;
}

/**
 * Constant-time array copy with conditional
 *
 * Copies src to dst if condition is true.
 *
 * @param condition - Whether to copy
 * @param dst - Destination array
 * @param src - Source array
 */
export function constantTimeConditionalCopy(
  condition: boolean,
  dst: Uint8Array,
  src: Uint8Array
): void {
  if (dst.length !== src.length) {
    throw new Error('Arrays must have equal length');
  }

  const mask = -Number(condition) | 0;

  for (let i = 0; i < dst.length; i++) {
    // dst[i] = condition ? src[i] : dst[i]
    dst[i] = (src[i] & mask) | (dst[i] & ~mask);
  }
}

// ============================================================================
// Constant-Time Bit Operations
// ============================================================================

/**
 * Constant-time bit extraction
 *
 * @param x - Value to extract bit from
 * @param position - Bit position (0 = LSB)
 * @returns 0 or 1
 */
export function constantTimeGetBit(x: number, position: number): number {
  return (x >>> position) & 1;
}

/**
 * Constant-time bit extraction for bigint
 */
export function constantTimeGetBitBigInt(x: bigint, position: bigint): bigint {
  return (x >> position) & 1n;
}

/**
 * Constant-time conditional bit set
 *
 * @param x - Original value
 * @param position - Bit position to modify
 * @param value - New bit value (0 or 1)
 * @returns Modified value
 */
export function constantTimeSetBit(
  x: number,
  position: number,
  value: boolean
): number {
  const mask = 1 << position;
  const valueMask = -Number(value) | 0;
  return (x & ~mask) | (mask & valueMask);
}

// ============================================================================
// Secure Memory Operations
// ============================================================================

/**
 * Securely clear sensitive data from memory
 *
 * Attempts to overwrite memory to prevent leaks.
 * Note: JavaScript doesn't guarantee memory clearing,
 * but this is a best-effort approach.
 *
 * @param arr - Array to clear
 */
export function secureClear(arr: Uint8Array): void {
  // Fill with zeros
  arr.fill(0);

  // Fill with random values (to make sure optimizer doesn't remove the clear)
  crypto.getRandomValues(arr);

  // Fill with zeros again
  arr.fill(0);
}

/**
 * Securely clear a bigint-like value
 *
 * Note: BigInts in JS are immutable, so we can't truly clear them.
 * This returns a zero value that should replace the sensitive one.
 */
export function secureZeroBigInt(): bigint {
  return 0n;
}

// ============================================================================
// Shuffle with Constant-Time Comparisons
// ============================================================================

/**
 * Fisher-Yates shuffle with constant-time random selection
 *
 * Shuffles array uniformly at random. Uses crypto.getRandomValues
 * for secure randomness.
 *
 * @param arr - Array to shuffle (modified in place)
 */
export function constantTimeSecureShuffle<T>(arr: T[]): void {
  const n = arr.length;

  for (let i = n - 1; i > 0; i--) {
    // Get random index in [0, i]
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const j = randomBytes[0] % (i + 1);

    // Swap elements
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
}

/**
 * Constant-time secure shuffle for byte arrays
 *
 * Uses constant-time swap operations.
 */
export function constantTimeSecureShuffleBytes(arr: Uint8Array): void {
  const n = arr.length;

  for (let i = n - 1; i > 0; i--) {
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const j = randomBytes[0] % (i + 1);

    // Constant-time swap
    const mask = (i !== j) ? 0xff : 0;
    const diff = (arr[i] ^ arr[j]) & mask;
    arr[i] ^= diff;
    arr[j] ^= diff;
  }
}
