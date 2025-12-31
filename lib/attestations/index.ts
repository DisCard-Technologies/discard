/**
 * DisCard 2035 - Attestations Module
 *
 * Exports for identity attestation management including
 * Solana Attestation Service (SAS) and Civic Gateway integration.
 */

// SAS Client
export {
  SASClient,
  getSASClient,
  initializeSASClient,
  type AttestationType,
  type AttestationIssuer,
  type AttestationStatus,
  type AttestationData,
  type CreateAttestationParams,
  type VerifyAttestationParams,
  type VerificationResult,
  type SASClientConfig,
} from "./sas-client";

// Civic Gateway Integration
export {
  CivicClient,
  getCivicClient,
  initializeCivicClient,
  CIVIC_NETWORKS,
  type CivicGatekeeperNetwork,
  type CivicPassState,
  type CivicGatewayToken,
  type CivicVerificationRequest,
  type CivicVerificationStatus,
  type CivicVerificationResult,
  type CivicClientConfig,
} from "./civic";
