/**
 * Differential Privacy Utilities for Convex
 *
 * Server-side DP mechanisms for fraud detection and analytics.
 * These run in Convex runtime and protect statistical queries.
 */

// ============================================================================
// Types
// ============================================================================

export interface DPConfig {
  /** Privacy budget (lower = more private, typical: 0.1 - 2.0) */
  epsilon: number;
  /** Failure probability (typical: 1e-5 to 1e-7) */
  delta: number;
  /** Maximum change from single record */
  sensitivity: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_DP_CONFIG: DPConfig = {
  epsilon: 1.0,
  delta: 1e-5,
  sensitivity: 1.0,
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

/**
 * Sample from standard normal distribution (Box-Muller)
 */
function sampleStandardNormal(): number {
  const u1 = Math.max(1e-10, secureRandom());
  const u2 = secureRandom();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ============================================================================
// Laplace Mechanism
// ============================================================================

/**
 * Sample from Laplace distribution
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
 * Laplace Mechanism - adds noise calibrated to sensitivity/epsilon
 *
 * Best for: counts, integers
 */
export function laplaceMechanism(value: number, config: DPConfig): number {
  const scale = config.sensitivity / config.epsilon;
  const noise = sampleLaplace(scale);
  return value + noise;
}

/**
 * Laplace mechanism for integer counts
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
 * Gaussian Mechanism - provides (epsilon, delta)-DP
 *
 * Best for: continuous values like amounts, averages
 */
export function gaussianMechanism(value: number, config: DPConfig): number {
  if (config.delta <= 0) {
    throw new Error('Delta must be positive for Gaussian mechanism');
  }

  const sigma = (config.sensitivity / config.epsilon) *
    Math.sqrt(2 * Math.log(1.25 / config.delta));

  const noise = sampleStandardNormal() * sigma;
  return value + noise;
}

/**
 * Gaussian mechanism with bounded output
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
// Noisy Aggregations
// ============================================================================

/**
 * Privacy-preserving count
 */
export function noisyCount(count: number, epsilon: number = 1.0): number {
  const config: DPConfig = { epsilon, delta: 0, sensitivity: 1 };
  return laplaceMechanismCount(count, config);
}

/**
 * Privacy-preserving average
 */
export function noisyAverage(
  values: number[],
  minValue: number,
  maxValue: number,
  epsilon: number = 1.0,
  delta: number = 1e-5
): number {
  if (values.length === 0) return 0;

  const trueAvg = values.reduce((a, b) => a + b, 0) / values.length;
  const range = maxValue - minValue;
  const sensitivity = range / values.length;

  const config: DPConfig = { epsilon, delta, sensitivity };
  return gaussianMechanismBounded(trueAvg, config, minValue, maxValue);
}

/**
 * Privacy-preserving standard deviation
 */
export function noisyStdDev(
  values: number[],
  minValue: number,
  maxValue: number,
  epsilon: number = 1.0,
  delta: number = 1e-5
): number {
  if (values.length < 2) return 0;

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const range = maxValue - minValue;
  const sensitivity = range / Math.sqrt(n);

  const config: DPConfig = { epsilon, delta, sensitivity };
  return Math.max(0, gaussianMechanismBounded(stdDev, config, 0, range));
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get DP config from user privacy settings
 */
export function getDPConfigFromSettings(
  privacySettings?: {
    dpEnabled?: boolean;
    dpEpsilon?: number;
    dpDelta?: number;
  }
): DPConfig | null {
  if (!privacySettings?.dpEnabled) {
    return null;
  }

  return {
    epsilon: privacySettings.dpEpsilon ?? 1.0,
    delta: privacySettings.dpDelta ?? 1e-5,
    sensitivity: 1.0, // Will be overridden per query
  };
}

/**
 * Apply DP to transaction stats if enabled
 */
export function applyDPToTransactionStats(
  stats: { count: number; avgAmount: number; stdDevAmount: number },
  dpConfig: DPConfig | null,
  maxAmount: number = 100000000 // $1M in cents
): { count: number; avgAmount: number; stdDevAmount: number } {
  if (!dpConfig) {
    return stats;
  }

  // Apply Laplace noise to count
  const noisyCountVal = noisyCount(stats.count, dpConfig.epsilon);

  // Apply Gaussian noise to average amount
  const noisyAvg = gaussianMechanism(stats.avgAmount, {
    ...dpConfig,
    sensitivity: maxAmount / Math.max(1, stats.count),
  });

  // Apply Gaussian noise to stdDev
  const noisyStd = gaussianMechanism(stats.stdDevAmount, {
    ...dpConfig,
    sensitivity: maxAmount / Math.sqrt(Math.max(2, stats.count)),
  });

  return {
    count: Math.max(0, noisyCountVal),
    avgAmount: Math.max(0, noisyAvg),
    stdDevAmount: Math.max(0, noisyStd),
  };
}

/**
 * Apply DP to velocity count if enabled
 */
export function applyDPToVelocityCount(
  count: number,
  dpConfig: DPConfig | null
): number {
  if (!dpConfig) {
    return count;
  }

  return Math.max(0, noisyCount(count, dpConfig.epsilon));
}
