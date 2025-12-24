/**
 * DisCard 2035 - Identity Module
 *
 * Exports for the alex.sovereign DID standard implementation.
 */

// DID Document types and utilities
export * from './did-document';

// ZK commitment utilities
export * from './zk-commitment';

// DID Manager
export {
  DIDManager,
  getDIDManager,
  type DIDManagerConfig,
  type CreateDIDOptions,
  type KeyRotationRequest,
  type RecoveryRequest,
  type GuardianAttestation,
} from './did-manager';
