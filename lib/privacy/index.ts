/**
 * Privacy Module
 *
 * Unified exports for privacy-preserving features in DisCard.
 * Combines stealth addresses, ring signatures, bulletproofs,
 * differential privacy, and ZK compliance into a single production-ready API.
 */

// Main service
export {
  PrivateTransferService,
  getPrivateTransferService,
  initializePrivateTransferService,
  type PrivateTransferParams,
  type PrivateTransferBundle,
  type PrivateTransferVerification,
  type PrivateTransferServiceConfig,
} from './private-transfer-service';

// Re-export stealth address utilities
export {
  generateStealthAddress,
  deriveStealthKey,
  isOwnStealthAddress,
  generateBatch as generateStealthBatch,
  scanAddresses as scanStealthAddresses,
  type StealthMeta,
  type DerivedKey,
} from '../stealth/address-generator';

// Re-export ring signature utilities
export {
  generateRingSignature,
  verifyRingSignature,
  isKeyImageUsed,
  checkLinkability,
  type RingSignature,
  type RingSignatureParams,
} from '../crypto/ring-signatures';

// Re-export Bulletproofs utilities
export {
  generateRangeProof,
  verifyRangeProof,
  computePedersenCommitment,
  type RangeProof,
} from '../crypto/bulletproofs';

// Re-export ElGamal utilities
export {
  generateKeypair as generateElGamalKeypair,
  encrypt as elgamalEncrypt,
  decrypt as elgamalDecrypt,
  add as elgamalAdd,
  rerandomize as elgamalRerandomize,
  serializeCiphertext,
  deserializeCiphertext,
  type ElGamalKeypair,
  type ElGamalCiphertext,
  type SerializedCiphertext,
} from '../crypto/elgamal';

// Re-export Differential Privacy utilities
export {
  laplaceMechanism,
  laplaceMechanismCount,
  gaussianMechanism,
  gaussianMechanismBounded,
  exponentialMechanism,
  exponentialMechanismWithScores,
  createPrivacyBudget,
  checkBudget,
  consumeBudget,
  advancedComposition,
  sumSensitivity,
  countSensitivity,
  meanSensitivity,
  varianceSensitivity,
  validateConfig,
  describePrivacyLevel,
  DEFAULT_DP_CONFIG,
  type DPConfig,
  type PrivacyBudget,
  type CompositionResult,
} from './differential-privacy';

// Re-export DP Aggregation utilities
export {
  noisyCount,
  noisyCountWithBudget,
  noisySum,
  noisyAverage,
  noisyAverageRobust,
  noisyHistogram,
  noisyHistogramWithSuppression,
  topKWithDP,
  topKByCount,
  noisyVariance,
  noisyStdDev,
  noisyPercentile,
  noisyMedian,
  noisyThresholdCheck,
  noisyRangeCount,
  type NoisyResult,
  type HistogramBin,
  type TopKItem,
} from './dp-aggregator';

// Re-export Amount Normalization utilities
export {
  normalizeToCommonAmount,
  normalizeSOLAmount,
  normalizeUSDCAmount,
  addDecoyAmounts,
  addNormalizedDecoyAmounts,
  chunkAmount,
  chunkIntoMixedDenominations,
  getDenominationsForCurrency,
  isCommonDenomination,
  suggestChunkingStrategy,
  type NormalizedAmount,
  type DecoySet,
  type ChunkedAmount,
} from './amount-normalizer';

// Re-export Constant-Time utilities (for crypto code)
export {
  constantTimeCompare,
  constantTimeCompareStrings,
  constantTimeCompareHex,
  constantTimeSelect,
  constantTimeSelectBigInt,
  constantTimeSelectBytes,
  constantTimeSwap,
  constantTimeSwapBigInt,
  constantTimeIsZero,
  constantTimeIsZeroBigInt,
  constantTimeLessThan,
  constantTimeGreaterOrEqual,
  constantTimeMin,
  constantTimeMax,
  constantTimeLookup,
  constantTimeConditionalCopy,
  secureClear,
  constantTimeSecureShuffle,
} from '../crypto/constant-time';
