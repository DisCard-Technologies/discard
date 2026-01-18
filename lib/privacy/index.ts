/**
 * Privacy Module
 *
 * Unified exports for privacy-preserving features in DisCard.
 * Combines stealth addresses, ring signatures, bulletproofs,
 * and ZK compliance into a single production-ready API.
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
