/**
 * Differential Privacy Primitives
 *
 * Implements core DP mechanisms to protect statistical queries
 * from inference attacks. Uses mathematically proven noise
 * distributions to provide epsilon-delta privacy guarantees.
 *
 * Key mechanisms:
 * - Laplace: For counts, integers (unbounded)
 * - Gaussian: For continuous values (bounded, tighter)
 * - Exponential: For categorical/selection queries
 *
 * @see https://www.cis.upenn.edu/~aaroth/Papers/privacybook.pdf
 */

// ============================================================================
// Types
// ============================================================================

export interface DPConfig {
  /** Privacy budget (lower = more private, typical: 0.1 - 2.0) */
  epsilon: number;
  /** Failure probability (typical: 1e-5 to 1e-7) */
  delta: number;
  /** Maximum change from single record (query-specific) */
  sensitivity: number;
}

export interface PrivacyBudget {
  /** Total epsilon budget */
  totalEpsilon: number;
  /** Total delta budget */
  totalDelta: number;
  /** Consumed epsilon */
  usedEpsilon: number;
  /** Consumed delta */
  usedDelta: number;
  /** Query count */
  queryCount: number;
}

export interface CompositionResult {
  /** Whether budget allows this query */
  allowed: boolean;
  /** Remaining epsilon after query */
  remainingEpsilon: number;
  /** Remaining delta after query */
  remainingDelta: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_DP_CONFIG: DPConfig = {
  epsilon: 1.0,      // Moderate privacy
  delta: 1e-5,       // Very small failure probability
  sensitivity: 1.0,  // Default for counting queries
};

// ============================================================================
// Laplace Mechanism
// ============================================================================

/**
 * Sample from Laplace distribution
 *
 * Uses inverse CDF method: sample U ~ Uniform(0,1),
 * return b * sign(U - 0.5) * ln(1 - 2|U - 0.5|)
 *
 * @param scale - Scale parameter (b = sensitivity/epsilon)
 * @returns Random sample from Laplace(0, scale)
 */
function sampleLaplace(scale: number): number {
  // Use crypto for secure randomness
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);
  const u = randomBytes[0] / 0xffffffff;

  // Avoid log(0) edge cases
  const clampedU = Math.max(1e-10, Math.min(1 - 1e-10, u));

  // Inverse CDF of Laplace distribution
  if (clampedU < 0.5) {
    return scale * Math.log(2 * clampedU);
  } else {
    return -scale * Math.log(2 * (1 - clampedU));
  }
}

/**
 * Laplace Mechanism for differential privacy
 *
 * Adds Laplace noise calibrated to sensitivity/epsilon.
 * Provides pure epsilon-differential privacy.
 *
 * Best for: Counting queries, integer values, unbounded sensitivity
 *
 * @param value - True value to protect
 * @param config - DP configuration
 * @returns Noisy value with DP guarantee
 */
export function laplaceMechanism(value: number, config: DPConfig): number {
  if (config.epsilon <= 0) {
    throw new Error('Epsilon must be positive');
  }
  if (config.sensitivity <= 0) {
    throw new Error('Sensitivity must be positive');
  }

  const scale = config.sensitivity / config.epsilon;
  const noise = sampleLaplace(scale);

  return value + noise;
}

/**
 * Laplace mechanism for integer counts
 *
 * Rounds result to nearest integer, ensures non-negative for counts.
 *
 * @param count - True count
 * @param config - DP configuration
 * @param allowNegative - Whether to allow negative results (default: false)
 * @returns Noisy count
 */
export function laplaceMechanismCount(
  count: number,
  config: DPConfig,
  allowNegative: boolean = false
): number {
  const noisyValue = laplaceMechanism(count, config);
  const rounded = Math.round(noisyValue);

  return allowNegative ? rounded : Math.max(0, rounded);
}

// ============================================================================
// Gaussian Mechanism
// ============================================================================

/**
 * Sample from standard normal distribution
 *
 * Uses Box-Muller transform for quality normal samples.
 *
 * @returns Sample from N(0, 1)
 */
function sampleStandardNormal(): number {
  const randomBytes = new Uint32Array(2);
  crypto.getRandomValues(randomBytes);

  const u1 = Math.max(1e-10, randomBytes[0] / 0xffffffff);
  const u2 = randomBytes[1] / 0xffffffff;

  // Box-Muller transform
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Sample from Gaussian distribution
 *
 * @param mean - Mean of distribution
 * @param sigma - Standard deviation
 * @returns Sample from N(mean, sigma^2)
 */
function sampleGaussian(mean: number, sigma: number): number {
  return mean + sigma * sampleStandardNormal();
}

/**
 * Gaussian Mechanism for differential privacy
 *
 * Adds Gaussian noise calibrated to provide (epsilon, delta)-DP.
 * Requires delta > 0 but provides tighter bounds than Laplace.
 *
 * Best for: Continuous values (amounts, averages), when delta > 0 acceptable
 *
 * Sigma calculation: sigma = sensitivity * sqrt(2 * ln(1.25/delta)) / epsilon
 *
 * @param value - True value to protect
 * @param config - DP configuration (must have delta > 0)
 * @returns Noisy value with (epsilon, delta)-DP guarantee
 */
export function gaussianMechanism(value: number, config: DPConfig): number {
  if (config.epsilon <= 0) {
    throw new Error('Epsilon must be positive');
  }
  if (config.delta <= 0) {
    throw new Error('Delta must be positive for Gaussian mechanism');
  }
  if (config.sensitivity <= 0) {
    throw new Error('Sensitivity must be positive');
  }

  // Standard Gaussian mechanism sigma formula
  const sigma = (config.sensitivity / config.epsilon) *
    Math.sqrt(2 * Math.log(1.25 / config.delta));

  const noise = sampleGaussian(0, sigma);

  return value + noise;
}

/**
 * Gaussian mechanism with bounded output
 *
 * Clips result to specified range after adding noise.
 * Note: Clipping can slightly affect privacy guarantees.
 *
 * @param value - True value
 * @param config - DP configuration
 * @param min - Minimum output value
 * @param max - Maximum output value
 * @returns Noisy value clipped to [min, max]
 */
export function gaussianMechanismBounded(
  value: number,
  config: DPConfig,
  min: number,
  max: number
): number {
  const noisyValue = gaussianMechanism(value, config);
  return Math.max(min, Math.min(max, noisyValue));
}

// ============================================================================
// Exponential Mechanism
// ============================================================================

/**
 * Exponential Mechanism for differential privacy
 *
 * Selects from categorical options based on utility scores.
 * Higher scores are more likely to be selected, but selection
 * is randomized to provide DP guarantees.
 *
 * Best for: Categorical queries, selection, ranking
 *
 * Probability of selecting item i: P(i) ∝ exp(epsilon * score(i) / (2 * sensitivity))
 *
 * @param items - Array of items to select from
 * @param scoreFn - Function returning utility score for each item (higher = better)
 * @param config - DP configuration
 * @returns Selected item with DP guarantee
 */
export function exponentialMechanism<T>(
  items: T[],
  scoreFn: (item: T) => number,
  config: DPConfig
): T {
  if (items.length === 0) {
    throw new Error('Items array cannot be empty');
  }
  if (config.epsilon <= 0) {
    throw new Error('Epsilon must be positive');
  }
  if (config.sensitivity <= 0) {
    throw new Error('Sensitivity must be positive');
  }

  // Calculate unnormalized log-probabilities
  const logProbs = items.map((item) => {
    const score = scoreFn(item);
    return (config.epsilon * score) / (2 * config.sensitivity);
  });

  // Numerical stability: subtract max before exp
  const maxLogProb = Math.max(...logProbs);
  const probs = logProbs.map((lp) => Math.exp(lp - maxLogProb));

  // Normalize
  const total = probs.reduce((a, b) => a + b, 0);
  const normalizedProbs = probs.map((p) => p / total);

  // Sample using inverse CDF
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);
  const u = randomBytes[0] / 0xffffffff;

  let cumulative = 0;
  for (let i = 0; i < items.length; i++) {
    cumulative += normalizedProbs[i];
    if (u <= cumulative) {
      return items[i];
    }
  }

  // Fallback (should rarely happen due to floating point)
  return items[items.length - 1];
}

/**
 * Exponential mechanism with pre-computed scores
 *
 * More efficient when scores are already calculated.
 *
 * @param items - Array of {item, score} pairs
 * @param config - DP configuration
 * @returns Selected item
 */
export function exponentialMechanismWithScores<T>(
  items: Array<{ item: T; score: number }>,
  config: DPConfig
): T {
  return exponentialMechanism(
    items,
    (entry) => entry.score,
    config
  ).item;
}

// ============================================================================
// Privacy Budget Composition
// ============================================================================

/**
 * Create a new privacy budget tracker
 *
 * @param totalEpsilon - Total epsilon budget to allocate
 * @param totalDelta - Total delta budget to allocate
 * @returns Fresh privacy budget
 */
export function createPrivacyBudget(
  totalEpsilon: number,
  totalDelta: number
): PrivacyBudget {
  return {
    totalEpsilon,
    totalDelta,
    usedEpsilon: 0,
    usedDelta: 0,
    queryCount: 0,
  };
}

/**
 * Check if a query can be performed within budget (basic composition)
 *
 * Uses basic sequential composition: epsilons and deltas add.
 *
 * @param budget - Current privacy budget
 * @param queryConfig - Config for proposed query
 * @returns Composition result
 */
export function checkBudget(
  budget: PrivacyBudget,
  queryConfig: DPConfig
): CompositionResult {
  const newEpsilon = budget.usedEpsilon + queryConfig.epsilon;
  const newDelta = budget.usedDelta + queryConfig.delta;

  return {
    allowed: newEpsilon <= budget.totalEpsilon && newDelta <= budget.totalDelta,
    remainingEpsilon: Math.max(0, budget.totalEpsilon - newEpsilon),
    remainingDelta: Math.max(0, budget.totalDelta - newDelta),
  };
}

/**
 * Consume budget for a query
 *
 * @param budget - Privacy budget to update
 * @param queryConfig - Config of executed query
 * @returns Updated budget
 */
export function consumeBudget(
  budget: PrivacyBudget,
  queryConfig: DPConfig
): PrivacyBudget {
  return {
    ...budget,
    usedEpsilon: budget.usedEpsilon + queryConfig.epsilon,
    usedDelta: budget.usedDelta + queryConfig.delta,
    queryCount: budget.queryCount + 1,
  };
}

/**
 * Advanced composition theorem
 *
 * For k queries with individual (epsilon, delta) guarantees,
 * provides tighter bounds than basic composition.
 *
 * Total privacy: (sqrt(2k * ln(1/delta')) * epsilon + k * epsilon * (e^epsilon - 1), k*delta + delta')
 *
 * @param individualEpsilon - Epsilon per query
 * @param individualDelta - Delta per query
 * @param queryCount - Number of queries (k)
 * @param targetDelta - Additional failure probability (delta')
 * @returns Composed (epsilon, delta) guarantee
 */
export function advancedComposition(
  individualEpsilon: number,
  individualDelta: number,
  queryCount: number,
  targetDelta: number = 1e-6
): { epsilon: number; delta: number } {
  const k = queryCount;
  const eps = individualEpsilon;

  // Advanced composition formula
  const term1 = Math.sqrt(2 * k * Math.log(1 / targetDelta)) * eps;
  const term2 = k * eps * (Math.exp(eps) - 1);
  const composedEpsilon = term1 + term2;
  const composedDelta = k * individualDelta + targetDelta;

  return {
    epsilon: composedEpsilon,
    delta: composedDelta,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate sensitivity for a sum query over bounded values
 *
 * @param maxValue - Maximum value any single record can contribute
 * @returns Sensitivity for sum query
 */
export function sumSensitivity(maxValue: number): number {
  return maxValue;
}

/**
 * Calculate sensitivity for a count query
 *
 * @returns Sensitivity for count query (always 1)
 */
export function countSensitivity(): number {
  return 1;
}

/**
 * Calculate sensitivity for a mean query over bounded values
 *
 * @param maxValue - Maximum value of data points
 * @param minValue - Minimum value of data points
 * @param n - Number of records (minimum expected)
 * @returns Sensitivity for mean query
 */
export function meanSensitivity(
  maxValue: number,
  minValue: number,
  n: number
): number {
  if (n <= 0) {
    throw new Error('n must be positive');
  }
  return (maxValue - minValue) / n;
}

/**
 * Calculate sensitivity for a variance query
 *
 * @param maxValue - Maximum value of data points
 * @param minValue - Minimum value of data points
 * @param n - Number of records
 * @returns Approximate sensitivity for variance
 */
export function varianceSensitivity(
  maxValue: number,
  minValue: number,
  n: number
): number {
  if (n <= 1) {
    throw new Error('n must be > 1 for variance');
  }
  const range = maxValue - minValue;
  // Sensitivity of variance is approximately range^2 / n
  return (range * range) / n;
}

/**
 * Validate DP configuration
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: DPConfig): void {
  if (config.epsilon <= 0) {
    throw new Error(`Invalid epsilon: ${config.epsilon}. Must be positive.`);
  }
  if (config.epsilon > 10) {
    console.warn(`High epsilon (${config.epsilon}) provides weak privacy guarantees`);
  }
  if (config.delta < 0) {
    throw new Error(`Invalid delta: ${config.delta}. Must be non-negative.`);
  }
  if (config.delta > 0.1) {
    console.warn(`High delta (${config.delta}) may compromise privacy`);
  }
  if (config.sensitivity <= 0) {
    throw new Error(`Invalid sensitivity: ${config.sensitivity}. Must be positive.`);
  }
}

/**
 * Get human-readable privacy level description
 *
 * @param epsilon - Privacy parameter
 * @returns Description of privacy level
 */
export function describePrivacyLevel(epsilon: number): string {
  if (epsilon <= 0.1) return 'Very High Privacy (ε ≤ 0.1)';
  if (epsilon <= 0.5) return 'High Privacy (ε ≤ 0.5)';
  if (epsilon <= 1.0) return 'Moderate Privacy (ε ≤ 1.0)';
  if (epsilon <= 2.0) return 'Low Privacy (ε ≤ 2.0)';
  return 'Minimal Privacy (ε > 2.0)';
}
