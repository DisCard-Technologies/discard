/**
 * Transaction Amount Normalization
 *
 * Normalizes transaction amounts to common denominations to increase
 * the anonymity set for privacy-preserving transactions.
 *
 * Unique amounts (e.g., $47.83) are easily linkable.
 * Common amounts (e.g., $50.00) blend into larger anonymity sets.
 *
 * Features:
 * - Round to common denominations
 * - Generate plausible decoy amounts
 * - Split into standard chunks
 */

// ============================================================================
// Types
// ============================================================================

export interface NormalizedAmount {
  /** Original amount in smallest unit (e.g., lamports, cents) */
  original: bigint;
  /** Normalized amount rounded to common denomination */
  normalized: bigint;
  /** Padding/change to account for difference */
  padding: bigint;
  /** Direction: whether padding is added or subtracted */
  paddingDirection: "add" | "subtract";
  /** The common denomination bucket used */
  bucket: string;
}

export interface DecoySet {
  /** Real amount (position unknown to observers) */
  realAmount: bigint;
  /** Index of real amount in the set */
  realIndex: number;
  /** All amounts including decoys */
  amounts: bigint[];
  /** Total number of amounts */
  count: number;
}

export interface ChunkedAmount {
  /** Original amount */
  original: bigint;
  /** Standard-sized chunks */
  chunks: bigint[];
  /** Remainder that doesn't fit standard chunks */
  remainder: bigint;
}

// ============================================================================
// Common Denomination Buckets
// ============================================================================

/**
 * Common USD denominations (in cents)
 * Ordered from largest to smallest for greedy matching
 */
const USD_DENOMINATIONS: bigint[] = [
  1000000n,   // $10,000
  500000n,    // $5,000
  200000n,    // $2,000
  100000n,    // $1,000
  50000n,     // $500
  20000n,     // $200
  10000n,     // $100
  5000n,      // $50
  2000n,      // $20
  1000n,      // $10
  500n,       // $5
  100n,       // $1
];

/**
 * Common SOL denominations (in lamports)
 * 1 SOL = 1,000,000,000 lamports
 */
const SOL_DENOMINATIONS: bigint[] = [
  100_000_000_000n,  // 100 SOL
  50_000_000_000n,   // 50 SOL
  25_000_000_000n,   // 25 SOL
  10_000_000_000n,   // 10 SOL
  5_000_000_000n,    // 5 SOL
  2_500_000_000n,    // 2.5 SOL
  1_000_000_000n,    // 1 SOL
  500_000_000n,      // 0.5 SOL
  250_000_000n,      // 0.25 SOL
  100_000_000n,      // 0.1 SOL
  50_000_000n,       // 0.05 SOL
  10_000_000n,       // 0.01 SOL
];

/**
 * Common USDC denominations (in micro units, 6 decimals)
 * 1 USDC = 1,000,000 micro units
 */
const USDC_DENOMINATIONS: bigint[] = [
  10_000_000_000n,   // $10,000
  5_000_000_000n,    // $5,000
  2_000_000_000n,    // $2,000
  1_000_000_000n,    // $1,000
  500_000_000n,      // $500
  200_000_000n,      // $200
  100_000_000n,      // $100
  50_000_000n,       // $50
  20_000_000n,       // $20
  10_000_000n,       // $10
  5_000_000n,        // $5
  1_000_000n,        // $1
];

// ============================================================================
// Amount Normalization
// ============================================================================

/**
 * Normalize amount to nearest common denomination
 *
 * Rounds to the nearest standard bucket to increase anonymity set.
 * Returns both the normalized amount and the padding/change.
 *
 * @param amount - Original amount in smallest unit
 * @param denominations - Array of common denominations to use
 * @param roundUp - If true, always round up; if false, round to nearest
 * @returns Normalized amount with padding info
 */
export function normalizeToCommonAmount(
  amount: bigint,
  denominations: bigint[] = USD_DENOMINATIONS,
  roundUp: boolean = true
): NormalizedAmount {
  if (amount <= 0n) {
    return {
      original: amount,
      normalized: 0n,
      padding: 0n,
      paddingDirection: "add",
      bucket: "zero",
    };
  }

  // Find the nearest denomination
  let bestDenom = denominations[denominations.length - 1]; // Smallest
  let bestDistance = amount;

  for (const denom of denominations) {
    // Round to this denomination
    const rounded = roundUp
      ? ((amount + denom - 1n) / denom) * denom  // Ceiling
      : (amount / denom) * denom;                 // Floor

    const distance = rounded >= amount
      ? rounded - amount
      : amount - rounded;

    // Prefer the closest, but also consider anonymity set size
    // Larger denominations have larger anonymity sets
    if (distance <= bestDistance && rounded >= amount) {
      bestDistance = distance;
      bestDenom = denom;
    }
  }

  // Calculate normalized amount
  const normalized = roundUp
    ? ((amount + bestDenom - 1n) / bestDenom) * bestDenom
    : (amount / bestDenom) * bestDenom;

  const padding = normalized >= amount
    ? normalized - amount
    : amount - normalized;

  return {
    original: amount,
    normalized,
    padding,
    paddingDirection: normalized >= amount ? "add" : "subtract",
    bucket: formatDenomination(bestDenom),
  };
}

/**
 * Normalize SOL amount
 */
export function normalizeSOLAmount(
  lamports: bigint,
  roundUp: boolean = true
): NormalizedAmount {
  return normalizeToCommonAmount(lamports, SOL_DENOMINATIONS, roundUp);
}

/**
 * Normalize USDC amount
 */
export function normalizeUSDCAmount(
  microUnits: bigint,
  roundUp: boolean = true
): NormalizedAmount {
  return normalizeToCommonAmount(microUnits, USDC_DENOMINATIONS, roundUp);
}

// ============================================================================
// Decoy Generation
// ============================================================================

/**
 * Generate plausible decoy amounts
 *
 * Creates a set of amounts where the real amount is hidden among
 * plausible decoys with similar magnitudes.
 *
 * @param realAmount - The actual transaction amount
 * @param count - Total number of amounts (including real)
 * @param variationPercent - Max percentage variation for decoys (default: 20%)
 * @returns Decoy set with shuffled amounts
 */
export function addDecoyAmounts(
  realAmount: bigint,
  count: number = 5,
  variationPercent: number = 20
): DecoySet {
  if (count < 2) {
    return {
      realAmount,
      realIndex: 0,
      amounts: [realAmount],
      count: 1,
    };
  }

  const amounts: bigint[] = [];
  const variation = (realAmount * BigInt(variationPercent)) / 100n;

  // Generate decoys
  for (let i = 0; i < count - 1; i++) {
    // Random variation within range
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const randomFactor = randomBytes[0] / 0xffffffff; // 0 to 1

    // Variation can be positive or negative
    const sign = Math.random() > 0.5 ? 1n : -1n;
    const decoyVariation = BigInt(Math.floor(Number(variation) * randomFactor)) * sign;
    const decoy = realAmount + decoyVariation;

    // Ensure positive and not exact match
    if (decoy > 0n && decoy !== realAmount) {
      amounts.push(decoy);
    } else {
      // Fallback: use a standard increment
      amounts.push(realAmount + (BigInt(i + 1) * (variation / BigInt(count))));
    }
  }

  // Add real amount
  amounts.push(realAmount);

  // Secure shuffle (Fisher-Yates)
  for (let i = amounts.length - 1; i > 0; i--) {
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const j = randomBytes[0] % (i + 1);
    [amounts[i], amounts[j]] = [amounts[j], amounts[i]];
  }

  // Find where real amount ended up
  const realIndex = amounts.findIndex((a) => a === realAmount);

  return {
    realAmount,
    realIndex,
    amounts,
    count: amounts.length,
  };
}

/**
 * Generate decoys with normalized amounts
 *
 * All amounts (including real) are first normalized to common denominations.
 */
export function addNormalizedDecoyAmounts(
  realAmount: bigint,
  count: number = 5,
  denominations: bigint[] = USD_DENOMINATIONS
): DecoySet {
  // Normalize the real amount
  const normalized = normalizeToCommonAmount(realAmount, denominations);

  // Generate decoys from nearby denominations
  const amounts: bigint[] = [];
  const denomIndex = denominations.findIndex(
    (d) => normalized.normalized >= d
  );

  // Pick denominations around the real one
  const startIdx = Math.max(0, denomIndex - Math.floor(count / 2));
  const endIdx = Math.min(denominations.length, startIdx + count);

  for (let i = startIdx; i < endIdx && amounts.length < count - 1; i++) {
    const denom = denominations[i];
    if (denom !== normalized.normalized) {
      // Add small multiplier variation
      const randomBytes = new Uint32Array(1);
      crypto.getRandomValues(randomBytes);
      const multiplier = BigInt(1 + (randomBytes[0] % 3)); // 1, 2, or 3
      amounts.push(denom * multiplier);
    }
  }

  // Add normalized real amount
  amounts.push(normalized.normalized);

  // Shuffle
  for (let i = amounts.length - 1; i > 0; i--) {
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const j = randomBytes[0] % (i + 1);
    [amounts[i], amounts[j]] = [amounts[j], amounts[i]];
  }

  return {
    realAmount: normalized.normalized,
    realIndex: amounts.findIndex((a) => a === normalized.normalized),
    amounts,
    count: amounts.length,
  };
}

// ============================================================================
// Amount Chunking
// ============================================================================

/**
 * Split amount into standard-sized chunks
 *
 * Useful for mixing protocols that work with fixed denominations.
 *
 * @param amount - Total amount to split
 * @param chunkSize - Standard chunk size
 * @returns Chunked amount with standard chunks and remainder
 */
export function chunkAmount(
  amount: bigint,
  chunkSize: bigint
): ChunkedAmount {
  if (chunkSize <= 0n) {
    throw new Error("Chunk size must be positive");
  }

  const numChunks = amount / chunkSize;
  const remainder = amount % chunkSize;

  const chunks: bigint[] = [];
  for (let i = 0n; i < numChunks; i++) {
    chunks.push(chunkSize);
  }

  return {
    original: amount,
    chunks,
    remainder,
  };
}

/**
 * Split amount into mixed standard chunks
 *
 * Uses greedy algorithm to minimize remainder while using
 * common denominations.
 *
 * @param amount - Total amount to split
 * @param denominations - Available chunk sizes
 * @returns Chunked amount using mixed denominations
 */
export function chunkIntoMixedDenominations(
  amount: bigint,
  denominations: bigint[] = USD_DENOMINATIONS
): ChunkedAmount {
  const chunks: bigint[] = [];
  let remaining = amount;

  // Sort denominations descending
  const sortedDenoms = [...denominations].sort((a, b) =>
    a > b ? -1 : a < b ? 1 : 0
  );

  // Greedy: use largest denominations first
  for (const denom of sortedDenoms) {
    while (remaining >= denom) {
      chunks.push(denom);
      remaining -= denom;
    }
  }

  return {
    original: amount,
    chunks,
    remainder: remaining,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format denomination for display
 */
function formatDenomination(denom: bigint): string {
  const num = Number(denom);
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(0)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(0)}K`;
  }
  return num.toString();
}

/**
 * Get recommended denominations for a currency
 */
export function getDenominationsForCurrency(
  currency: "USD" | "SOL" | "USDC" | "lamports" | "cents" | "microUnits"
): bigint[] {
  switch (currency) {
    case "USD":
    case "cents":
      return USD_DENOMINATIONS;
    case "SOL":
    case "lamports":
      return SOL_DENOMINATIONS;
    case "USDC":
    case "microUnits":
      return USDC_DENOMINATIONS;
    default:
      return USD_DENOMINATIONS;
  }
}

/**
 * Check if amount is already a common denomination
 */
export function isCommonDenomination(
  amount: bigint,
  denominations: bigint[] = USD_DENOMINATIONS
): boolean {
  return denominations.some((d) => amount % d === 0n && amount / d <= 10n);
}

/**
 * Suggest optimal chunk configuration for mixing
 *
 * Returns a configuration that maximizes anonymity while minimizing
 * the number of transactions.
 */
export function suggestChunkingStrategy(
  amount: bigint,
  denominations: bigint[] = USD_DENOMINATIONS,
  maxChunks: number = 10
): {
  recommended: ChunkedAmount;
  anonymityScore: number;
  transactionCount: number;
} {
  const chunked = chunkIntoMixedDenominations(amount, denominations);

  // Limit chunks to maxChunks
  if (chunked.chunks.length > maxChunks) {
    // Re-chunk with larger minimum denomination
    const minDenom = denominations.find(
      (d) => amount / d <= BigInt(maxChunks)
    ) || denominations[0];

    return suggestChunkingStrategy(amount, [minDenom], maxChunks);
  }

  // Calculate anonymity score (higher = better)
  // Based on: fewer unique denominations, common amounts, reasonable count
  const uniqueDenoms = new Set(chunked.chunks.map((c) => c.toString())).size;
  const avgChunkSize = chunked.chunks.reduce((a, b) => a + b, 0n) /
    BigInt(chunked.chunks.length || 1);
  const isCommonAvg = isCommonDenomination(avgChunkSize, denominations);

  const anonymityScore = Math.max(
    0,
    100 -
      uniqueDenoms * 10 -
      Number(chunked.remainder) / Number(amount || 1n) * 50 +
      (isCommonAvg ? 20 : 0)
  );

  return {
    recommended: chunked,
    anonymityScore: Math.round(anonymityScore),
    transactionCount: chunked.chunks.length + (chunked.remainder > 0n ? 1 : 0),
  };
}
