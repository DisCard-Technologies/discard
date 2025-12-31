/**
 * DisCard 2035 - Compression Module
 *
 * Exports for the Light Protocol ZK Compression integration.
 */

// Light Protocol Client
export {
  LightClient,
  getLightClient,
  initializeLightClient,
  type LightClientConfig,
  type CardStateData,
  type DIDCommitmentData,
  type CompressedProof,
  type CreateCompressedAccountResult,
  type UpdateCompressedAccountResult,
} from './light-client';

// Compressed Account Manager
export {
  CompressedAccountManager,
  getCompressedAccountManager,
  centsToCompressedUnits,
  compressedUnitsToCents,
  generateCardContextHash,
  type CreateCardAccountParams,
  type CreateDIDAccountParams,
  type CardBalanceUpdate,
  type VelocityUpdate,
  type AccountSyncResult,
} from './compressed-accounts';
