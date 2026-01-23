/**
 * Differential Privacy Utilities for Brain Orchestrator
 *
 * Lightweight DP mechanisms to protect user behavioral patterns
 * from inference attacks through action frequency analysis.
 */

// ============================================================================
// Types
// ============================================================================

export interface DPConfig {
  /** Whether DP is enabled */
  enabled: boolean;
  /** Privacy budget (lower = more private, typical: 0.1 - 2.0) */
  epsilon: number;
  /** Failure probability (typical: 1e-5) */
  delta: number;
}

export const DEFAULT_DP_CONFIG: DPConfig = {
  enabled: false,
  epsilon: 1.0,
  delta: 1e-5,
};

// ============================================================================
// Random Number Generation
// ============================================================================

/**
 * Generate cryptographically secure random number [0, 1)
 */
function secureRandom(): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] / 0xffffffff;
}

// ============================================================================
// Laplace Mechanism
// ============================================================================

/**
 * Sample from Laplace distribution
 *
 * @param scale - Scale parameter (sensitivity / epsilon)
 * @returns Random sample from Laplace(0, scale)
 */
function sampleLaplace(scale: number): number {
  const u = secureRandom();
  const clampedU = Math.max(1e-10, Math.min(1 - 1e-10, u));

  if (clampedU < 0.5) {
    return scale * Math.log(2 * clampedU);
  } else {
    return -scale * Math.log(2 * (1 - clampedU));
  }
}

/**
 * Apply Laplace noise to a count
 *
 * @param count - True count value
 * @param epsilon - Privacy parameter
 * @param sensitivity - Query sensitivity (default: 1 for counting)
 * @returns Noisy count (non-negative integer)
 */
export function noisyCount(
  count: number,
  epsilon: number,
  sensitivity: number = 1
): number {
  if (epsilon <= 0) {
    return count; // No privacy, return exact
  }

  const scale = sensitivity / epsilon;
  const noise = sampleLaplace(scale);
  const noisyValue = Math.round(count + noise);

  // Ensure non-negative
  return Math.max(0, noisyValue);
}

/**
 * Apply noise to a timestamp to obfuscate exact timing
 *
 * Rounds to a time bucket and adds random offset within bucket.
 *
 * @param timestamp - Exact timestamp in milliseconds
 * @param bucketSizeMs - Size of time bucket (default: 1 hour)
 * @returns Noisy timestamp
 */
export function noisyTimestamp(
  timestamp: number,
  bucketSizeMs: number = 3600000 // 1 hour default
): number {
  // Round to bucket
  const bucket = Math.floor(timestamp / bucketSizeMs) * bucketSizeMs;

  // Add random offset within bucket
  const offset = Math.floor(secureRandom() * bucketSizeMs);

  return bucket + offset;
}

/**
 * Apply DP to action frequency data
 *
 * @param actions - Array of action frequency records
 * @param config - DP configuration
 * @returns Noisy action frequencies
 */
export function applyDPToActionFrequencies(
  actions: Array<{ action: string; count: number; lastUsed: number }>,
  config: DPConfig
): Array<{ action: string; count: number; lastUsed: number }> {
  if (!config.enabled || config.epsilon <= 0) {
    return actions;
  }

  return actions.map((item) => ({
    action: item.action,
    count: noisyCount(item.count, config.epsilon),
    lastUsed: noisyTimestamp(item.lastUsed),
  }));
}

/**
 * Apply DP to recent merchants list
 *
 * Uses randomized response to protect the exact merchant list.
 * With probability p, returns the actual list; otherwise returns shuffled/truncated.
 *
 * @param merchants - List of merchant IDs
 * @param config - DP configuration
 * @returns Privacy-protected merchant list
 */
export function applyDPToRecentMerchants(
  merchants: string[],
  config: DPConfig
): string[] {
  if (!config.enabled || merchants.length === 0) {
    return merchants;
  }

  // Randomly truncate list to reduce information leakage
  const keepProbability = Math.exp(-config.epsilon);
  const kept = merchants.filter(() => secureRandom() > keepProbability);

  // Shuffle the order
  const shuffled = [...kept];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(secureRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}
