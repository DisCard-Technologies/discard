/**
 * DisCard 2035 - TEE Module
 *
 * Exports for the Turnkey TEE integration.
 */

// Turnkey Client
export {
  TurnkeyManager,
  getTurnkeyManager,
  initializeTurnkeyManager,
  type TurnkeyConfig,
  type SubOrganization,
  type PolicyConfig,
  type TransactionProposal,
  type SignatureResult,
} from './turnkey-client';

// WebAuthn Stamper
export {
  DisCardStamper,
  getStamper,
  initializeStamper,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  arrayBufferToBase64Url,
  base64UrlToArrayBuffer,
  type StamperConfig,
  type Stamp,
  type BiometricAuthResult,
} from './stamper';
