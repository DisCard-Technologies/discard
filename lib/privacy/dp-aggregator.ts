/**
 * Differential Privacy Safe Aggregation Utilities
 *
 * Higher-level functions for common aggregation operations
 * with built-in differential privacy protection.
 *
 * These functions wrap the core DP mechanisms to provide
 * easy-to-use privacy-preserving statistics.
 */

import {
  type DPConfig,
  type PrivacyBudget,
  laplaceMechanism,
  laplaceMechanismCount,
  gaussianMechanism,
  gaussianMechanismBounded,
  exponentialMechanism,
  consumeBudget,
  checkBudget,
  DEFAULT_DP_CONFIG,
} from './differential-privacy';

// ============================================================================
// Types
// ============================================================================

export interface NoisyResult<T> {
  /** The noisy (privatized) value */
  value: T;
  /** Epsilon consumed by this query */
  epsilonConsumed: number;
  /** Delta consumed by this query (0 for Laplace) */
  deltaConsumed: number;
  /** Human-readable accuracy estimate */
  accuracyEstimate?: string;
}

export interface HistogramBin {
  /** Bin label/key */
  label: string;
  /** Noisy count */
  count: number;
}

export interface TopKItem<T> {
  /** The item */
  item: T;
  /** Noisy score/count */
  score: number;
}

// ============================================================================
// Noisy Count
// ============================================================================

/**
 * Privacy-preserving count query
 *
 * Adds Laplace noise calibrated to provide epsilon-DP.
 *
 * @param count - True count
 * @param epsilon - Privacy parameter (default: 1.0)
 * @returns Noisy count result
 */
export function noisyCount(
  count: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon
): NoisyResult<number> {
  const config: DPConfig = {
    epsilon,
    delta: 0,
    sensitivity: 1, // Count sensitivity is always 1
  };

  const noisyValue = laplaceMechanismCount(count, config);

  // 95% confidence interval for Laplace: ±(ln(20) / epsilon) ≈ ±3/epsilon
  const margin = Math.ceil(3 / epsilon);

  return {
    value: noisyValue,
    epsilonConsumed: epsilon,
    deltaConsumed: 0,
    accuracyEstimate: `±${margin} with 95% confidence`,
  };
}

/**
 * Privacy-preserving count with explicit budget tracking
 *
 * @param count - True count
 * @param budget - Privacy budget to consume from
 * @param epsilon - Epsilon for this query
 * @returns Noisy count and updated budget
 */
export function noisyCountWithBudget(
  count: number,
  budget: PrivacyBudget,
  epsilon: number = 0.1
): { result: NoisyResult<number>; newBudget: PrivacyBudget } {
  const config: DPConfig = { epsilon, delta: 0, sensitivity: 1 };

  const composition = checkBudget(budget, config);
  if (!composition.allowed) {
    throw new Error('Privacy budget exhausted');
  }

  const result = noisyCount(count, epsilon);
  const newBudget = consumeBudget(budget, config);

  return { result, newBudget };
}

// ============================================================================
// Noisy Sum
// ============================================================================

/**
 * Privacy-preserving sum query
 *
 * @param values - Array of values to sum
 * @param maxValue - Maximum possible value (for sensitivity)
 * @param epsilon - Privacy parameter
 * @returns Noisy sum result
 */
export function noisySum(
  values: number[],
  maxValue: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon
): NoisyResult<number> {
  const trueSum = values.reduce((a, b) => a + b, 0);

  const config: DPConfig = {
    epsilon,
    delta: 0,
    sensitivity: maxValue, // One person can contribute at most maxValue
  };

  const noisyValue = laplaceMechanism(trueSum, config);
  const margin = Math.ceil((3 * maxValue) / epsilon);

  return {
    value: noisyValue,
    epsilonConsumed: epsilon,
    deltaConsumed: 0,
    accuracyEstimate: `±${margin} with 95% confidence`,
  };
}

// ============================================================================
// Noisy Average
// ============================================================================

/**
 * Privacy-preserving average/mean query
 *
 * Uses Gaussian mechanism for tighter bounds on continuous values.
 *
 * @param values - Array of values
 * @param minValue - Minimum possible value
 * @param maxValue - Maximum possible value
 * @param epsilon - Privacy parameter
 * @param delta - Failure probability (default: 1e-5)
 * @returns Noisy average result
 */
export function noisyAverage(
  values: number[],
  minValue: number,
  maxValue: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon,
  delta: number = DEFAULT_DP_CONFIG.delta
): NoisyResult<number> {
  if (values.length === 0) {
    return {
      value: 0,
      epsilonConsumed: 0,
      deltaConsumed: 0,
      accuracyEstimate: 'No data',
    };
  }

  const trueAvg = values.reduce((a, b) => a + b, 0) / values.length;
  const range = maxValue - minValue;

  // Sensitivity for average: range / n
  const sensitivity = range / values.length;

  const config: DPConfig = { epsilon, delta, sensitivity };
  const noisyValue = gaussianMechanismBounded(trueAvg, config, minValue, maxValue);

  // Standard deviation of noise
  const sigma = (sensitivity / epsilon) * Math.sqrt(2 * Math.log(1.25 / delta));

  return {
    value: noisyValue,
    epsilonConsumed: epsilon,
    deltaConsumed: delta,
    accuracyEstimate: `σ ≈ ${sigma.toFixed(2)}`,
  };
}

/**
 * Privacy-preserving average with separate count noise
 *
 * More accurate when count itself should be private.
 * Uses two queries: one for sum, one for count.
 *
 * @param values - Array of values
 * @param minValue - Minimum possible value
 * @param maxValue - Maximum possible value
 * @param epsilon - Total privacy budget (split between sum and count)
 * @returns Noisy average result
 */
export function noisyAverageRobust(
  values: number[],
  minValue: number,
  maxValue: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon
): NoisyResult<number> {
  // Split epsilon between count and sum
  const countEpsilon = epsilon / 2;
  const sumEpsilon = epsilon / 2;

  const noisyN = noisyCount(values.length, countEpsilon);
  const noisySumResult = noisySum(values, maxValue, sumEpsilon);

  // Avoid division by zero
  const denominator = Math.max(1, noisyN.value);
  const noisyAvg = noisySumResult.value / denominator;

  // Clip to valid range
  const clippedAvg = Math.max(minValue, Math.min(maxValue, noisyAvg));

  return {
    value: clippedAvg,
    epsilonConsumed: epsilon,
    deltaConsumed: 0,
    accuracyEstimate: `Combined count and sum noise`,
  };
}

// ============================================================================
// Noisy Histogram
// ============================================================================

/**
 * Privacy-preserving histogram
 *
 * Adds independent Laplace noise to each bin count.
 *
 * @param data - Array of categorical values
 * @param categories - All possible category labels
 * @param epsilon - Total privacy budget (split across bins)
 * @returns Array of noisy bin counts
 */
export function noisyHistogram(
  data: string[],
  categories: string[],
  epsilon: number = DEFAULT_DP_CONFIG.epsilon
): NoisyResult<HistogramBin[]> {
  // Count occurrences
  const counts = new Map<string, number>();
  for (const cat of categories) {
    counts.set(cat, 0);
  }
  for (const item of data) {
    if (counts.has(item)) {
      counts.set(item, counts.get(item)! + 1);
    }
  }

  // Per-bin epsilon (parallel composition: can use full epsilon for each)
  // Since bins are disjoint, we get parallel composition benefit
  const binEpsilon = epsilon;

  const bins: HistogramBin[] = [];
  for (const [label, count] of counts) {
    const noisyBin = noisyCount(count, binEpsilon);
    bins.push({
      label,
      count: noisyBin.value,
    });
  }

  return {
    value: bins,
    epsilonConsumed: epsilon, // Parallel composition
    deltaConsumed: 0,
    accuracyEstimate: `±${Math.ceil(3 / epsilon)} per bin with 95% confidence`,
  };
}

/**
 * Privacy-preserving histogram with threshold suppression
 *
 * Bins below threshold are suppressed to prevent small-count leakage.
 *
 * @param data - Array of categorical values
 * @param categories - All possible category labels
 * @param epsilon - Privacy budget
 * @param threshold - Minimum count to report (others become 0)
 * @returns Histogram with suppressed small bins
 */
export function noisyHistogramWithSuppression(
  data: string[],
  categories: string[],
  epsilon: number = DEFAULT_DP_CONFIG.epsilon,
  threshold: number = 5
): NoisyResult<HistogramBin[]> {
  const result = noisyHistogram(data, categories, epsilon);

  // Suppress bins below threshold
  const suppressedBins = result.value.map((bin) => ({
    ...bin,
    count: bin.count < threshold ? 0 : bin.count,
  }));

  return {
    ...result,
    value: suppressedBins,
  };
}

// ============================================================================
// Top-K with Differential Privacy
// ============================================================================

/**
 * Privacy-preserving top-k selection
 *
 * Uses exponential mechanism to select items, with noisy scores.
 *
 * @param items - Array of items with scores
 * @param k - Number of top items to return
 * @param epsilon - Privacy budget (split across k selections)
 * @returns Top-k items with noisy scores
 */
export function topKWithDP<T>(
  items: Array<{ item: T; score: number }>,
  k: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon
): NoisyResult<TopKItem<T>[]> {
  if (k <= 0 || items.length === 0) {
    return {
      value: [],
      epsilonConsumed: 0,
      deltaConsumed: 0,
    };
  }

  const effectiveK = Math.min(k, items.length);
  const perSelectionEpsilon = epsilon / effectiveK;

  // Calculate score sensitivity (max difference from removing one item)
  const scores = items.map((i) => i.score);
  const maxScore = Math.max(...scores);
  const sensitivity = maxScore > 0 ? maxScore : 1;

  const config: DPConfig = {
    epsilon: perSelectionEpsilon,
    delta: 0,
    sensitivity,
  };

  const selected: TopKItem<T>[] = [];
  const remaining = [...items];

  for (let i = 0; i < effectiveK && remaining.length > 0; i++) {
    // Use exponential mechanism to select next item
    const selectedItem = exponentialMechanism(
      remaining,
      (entry) => entry.score,
      config
    );

    // Add Laplace noise to the score for output
    const noisyScore = laplaceMechanism(selectedItem.score, config);

    selected.push({
      item: selectedItem.item,
      score: Math.max(0, noisyScore), // Ensure non-negative
    });

    // Remove selected item from remaining
    const idx = remaining.indexOf(selectedItem);
    if (idx >= 0) {
      remaining.splice(idx, 1);
    }
  }

  return {
    value: selected,
    epsilonConsumed: epsilon,
    deltaConsumed: 0,
    accuracyEstimate: `${effectiveK} items selected with ε/${effectiveK} per selection`,
  };
}

/**
 * Privacy-preserving top-k by count
 *
 * For scenarios where items are repeated and we want most frequent.
 *
 * @param data - Array of items (with repetitions)
 * @param k - Number of top items to return
 * @param epsilon - Privacy budget
 * @returns Top-k most frequent items with noisy counts
 */
export function topKByCount<T>(
  data: T[],
  k: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon
): NoisyResult<TopKItem<T>[]> {
  // Count occurrences
  const counts = new Map<T, number>();
  for (const item of data) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  // Convert to scored items
  const scoredItems = Array.from(counts.entries()).map(([item, count]) => ({
    item,
    score: count,
  }));

  return topKWithDP(scoredItems, k, epsilon);
}

// ============================================================================
// Noisy Variance / Standard Deviation
// ============================================================================

/**
 * Privacy-preserving variance estimate
 *
 * @param values - Array of values
 * @param minValue - Minimum possible value
 * @param maxValue - Maximum possible value
 * @param epsilon - Privacy budget
 * @param delta - Failure probability
 * @returns Noisy variance
 */
export function noisyVariance(
  values: number[],
  minValue: number,
  maxValue: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon,
  delta: number = DEFAULT_DP_CONFIG.delta
): NoisyResult<number> {
  if (values.length < 2) {
    return {
      value: 0,
      epsilonConsumed: 0,
      deltaConsumed: 0,
      accuracyEstimate: 'Insufficient data',
    };
  }

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;

  // Sensitivity for variance: (range^2) / n
  const range = maxValue - minValue;
  const sensitivity = (range * range) / n;

  const config: DPConfig = { epsilon, delta, sensitivity };
  const noisyValue = gaussianMechanismBounded(variance, config, 0, range * range);

  return {
    value: noisyValue,
    epsilonConsumed: epsilon,
    deltaConsumed: delta,
  };
}

/**
 * Privacy-preserving standard deviation
 *
 * @param values - Array of values
 * @param minValue - Minimum possible value
 * @param maxValue - Maximum possible value
 * @param epsilon - Privacy budget
 * @param delta - Failure probability
 * @returns Noisy standard deviation
 */
export function noisyStdDev(
  values: number[],
  minValue: number,
  maxValue: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon,
  delta: number = DEFAULT_DP_CONFIG.delta
): NoisyResult<number> {
  const varianceResult = noisyVariance(values, minValue, maxValue, epsilon, delta);

  return {
    value: Math.sqrt(Math.max(0, varianceResult.value)),
    epsilonConsumed: varianceResult.epsilonConsumed,
    deltaConsumed: varianceResult.deltaConsumed,
    accuracyEstimate: varianceResult.accuracyEstimate,
  };
}

// ============================================================================
// Percentile / Quantile Estimation
// ============================================================================

/**
 * Privacy-preserving percentile estimation
 *
 * Uses exponential mechanism to select from binned values.
 *
 * @param values - Array of values
 * @param percentile - Target percentile (0-100)
 * @param epsilon - Privacy budget
 * @returns Noisy percentile value
 */
export function noisyPercentile(
  values: number[],
  percentile: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon
): NoisyResult<number> {
  if (values.length === 0) {
    return {
      value: 0,
      epsilonConsumed: 0,
      deltaConsumed: 0,
      accuracyEstimate: 'No data',
    };
  }

  // Sort values
  const sorted = [...values].sort((a, b) => a - b);

  // Target rank
  const targetRank = Math.floor((percentile / 100) * (sorted.length - 1));

  // Score function: negative absolute distance from target rank
  const items = sorted.map((value, index) => ({
    item: value,
    score: -Math.abs(index - targetRank),
  }));

  // Sensitivity: changing one value changes rank by at most 1
  const config: DPConfig = {
    epsilon,
    delta: 0,
    sensitivity: 1,
  };

  const selected = exponentialMechanism(items, (i) => i.score, config);

  return {
    value: selected.item,
    epsilonConsumed: epsilon,
    deltaConsumed: 0,
    accuracyEstimate: `Approximate ${percentile}th percentile`,
  };
}

/**
 * Privacy-preserving median
 *
 * Convenience wrapper for 50th percentile.
 */
export function noisyMedian(
  values: number[],
  epsilon: number = DEFAULT_DP_CONFIG.epsilon
): NoisyResult<number> {
  return noisyPercentile(values, 50, epsilon);
}

// ============================================================================
// Threshold / Predicate Queries
// ============================================================================

/**
 * Privacy-preserving threshold check
 *
 * Reports whether count exceeds threshold with DP noise.
 *
 * @param count - True count
 * @param threshold - Threshold to check against
 * @param epsilon - Privacy budget
 * @returns Whether noisy count exceeds threshold
 */
export function noisyThresholdCheck(
  count: number,
  threshold: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon
): NoisyResult<boolean> {
  const noisyResult = noisyCount(count, epsilon);

  return {
    value: noisyResult.value >= threshold,
    epsilonConsumed: epsilon,
    deltaConsumed: 0,
    accuracyEstimate: noisyResult.accuracyEstimate,
  };
}

/**
 * Privacy-preserving range query
 *
 * Reports noisy count of items in a value range.
 *
 * @param values - Array of values
 * @param min - Range minimum
 * @param max - Range maximum
 * @param epsilon - Privacy budget
 * @returns Noisy count of values in range
 */
export function noisyRangeCount(
  values: number[],
  min: number,
  max: number,
  epsilon: number = DEFAULT_DP_CONFIG.epsilon
): NoisyResult<number> {
  const inRangeCount = values.filter((v) => v >= min && v <= max).length;
  return noisyCount(inRangeCount, epsilon);
}
