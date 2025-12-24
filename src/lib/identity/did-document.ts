/**
 * DisCard 2035 - DID Document Types (alex.sovereign Standard)
 *
 * Implements W3C DID v1.1 specification with the did:sol:zk method
 * for privacy-preserving identity on Solana via ZK Compression.
 *
 * @see https://www.w3.org/TR/did-core/
 * @see https://w3c.github.io/did-spec-registries/
 */

// ============================================================================
// DID Core Types
// ============================================================================

/**
 * DID URI format: did:sol:zk:<identifier>
 * Examples:
 * - did:sol:zk:alex.sovereign
 * - did:sol:zk:5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty
 */
export type DIDString = `did:sol:zk:${string}`;

/**
 * DID URL with optional path, query, and fragment
 * Example: did:sol:zk:alex.sovereign#key-1
 */
export type DIDURL = `${DIDString}${string}`;

/**
 * JSON Web Key (JWK) for P-256 elliptic curve (passkey compatible)
 */
export interface P256PublicKeyJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string; // Base64url-encoded X coordinate
  y: string; // Base64url-encoded Y coordinate
  kid?: string; // Key ID
  use?: 'sig' | 'enc';
  alg?: 'ES256';
}

/**
 * JSON Web Key for Ed25519 (Solana native)
 */
export interface Ed25519PublicKeyJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string; // Base64url-encoded public key
  kid?: string;
  use?: 'sig';
  alg?: 'EdDSA';
}

export type PublicKeyJwk = P256PublicKeyJwk | Ed25519PublicKeyJwk;

/**
 * Verification Method - public key associated with the DID
 */
export interface VerificationMethod {
  id: string; // e.g., "did:sol:zk:alex.sovereign#key-1" or "#key-1"
  type: VerificationMethodType;
  controller: DIDString; // DID that controls this key
  publicKeyJwk?: PublicKeyJwk;
  publicKeyMultibase?: string; // Multibase-encoded key (z prefix for Ed25519)
  publicKeyBase58?: string; // Base58-encoded key (Solana format)
}

export type VerificationMethodType =
  | 'JsonWebKey2020'
  | 'Multikey'
  | 'Ed25519VerificationKey2020'
  | 'EcdsaSecp256k1VerificationKey2019';

/**
 * Service Endpoint - associated services for the DID
 */
export interface ServiceEndpoint {
  id: string; // e.g., "#payments" or "did:sol:zk:alex.sovereign#payments"
  type: string | string[]; // e.g., "DisCardPayments", "DisCardMessaging"
  serviceEndpoint: string | string[] | Record<string, unknown>;
  description?: string;
}

// ============================================================================
// DID Document (W3C DID Core v1.1)
// ============================================================================

/**
 * Complete DID Document following W3C DID Core v1.1
 */
export interface DIDDocument {
  '@context': DIDContext;
  id: DIDString;
  controller?: DIDString | DIDString[];
  alsoKnownAs?: string[];
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  capabilityInvocation?: (string | VerificationMethod)[];
  capabilityDelegation?: (string | VerificationMethod)[];
  service?: ServiceEndpoint[];
}

export type DIDContext =
  | string
  | string[]
  | ['https://www.w3.org/ns/did/v1', ...string[]];

// ============================================================================
// alex.sovereign Extensions
// ============================================================================

/**
 * Recovery Guardian - trusted contact for social recovery
 */
export interface RecoveryGuardian {
  guardianDid: DIDString;
  attestationHash: string; // SAS attestation hash
  addedAt: number;
  status: 'active' | 'revoked';
  nickname?: string;
}

/**
 * Extended DID Document with DisCard-specific fields
 */
export interface AlexSovereignDIDDocument extends Omit<DIDDocument, 'service'> {
  '@context': [
    'https://www.w3.org/ns/did/v1',
    'https://w3id.org/security/suites/jws-2020/v1',
    'https://discard.app/ns/did/v1', // DisCard-specific context
  ];

  // Recovery configuration
  recoveryThreshold?: number; // 2-of-3, 3-of-5, etc.
  recoveryGuardians?: RecoveryGuardian[];

  // DisCard services
  service?: DisCardServiceEndpoint[];

  // Metadata (not part of core spec but useful)
  created?: string; // ISO 8601 timestamp
  updated?: string; // ISO 8601 timestamp

  // Key rotation tracking
  keyRotationCount?: number;
  lastKeyRotationAt?: number;
}

/**
 * DisCard-specific service endpoint types
 */
export interface DisCardServiceEndpoint {
  id: string;
  type: string; // 'DisCardPayments', 'DisCardMessaging', 'DisCardCards', 'DisCardDeFi', 'LinkedDomains', etc.
  serviceEndpoint: string;
  description?: string;
}

// ============================================================================
// ZK Commitment Types
// ============================================================================

/**
 * Commitment to DID document for on-chain anchoring
 */
export interface DIDCommitment {
  did: DIDString;
  documentHash: string; // SHA-256 of canonical DID document
  commitmentHash: string; // Poseidon hash for ZK proofs
  merkleRoot?: string; // Light Protocol state tree root
  timestamp: number;
}

/**
 * ZK Validity Proof for DID document
 */
export interface DIDValidityProof {
  type: 'groth16' | 'plonk';
  proofData: Uint8Array;
  publicInputs: string[];
  verificationKey?: string;
  cid?: string; // IPFS CID if stored off-chain
}

// ============================================================================
// DID Resolution Types
// ============================================================================

/**
 * DID Resolution Result
 */
export interface DIDResolutionResult {
  '@context': 'https://w3id.org/did-resolution/v1';
  didDocument: DIDDocument | null;
  didResolutionMetadata: DIDResolutionMetadata;
  didDocumentMetadata: DIDDocumentMetadata;
}

export interface DIDResolutionMetadata {
  contentType?: string;
  error?: DIDResolutionError;
  retrieved?: string;
}

export type DIDResolutionError =
  | 'invalidDid'
  | 'notFound'
  | 'representationNotSupported'
  | 'methodNotSupported'
  | 'internalError';

export interface DIDDocumentMetadata {
  created?: string;
  updated?: string;
  deactivated?: boolean;
  versionId?: string;
  nextUpdate?: string;
  nextVersionId?: string;
  equivalentId?: string[];
  canonicalId?: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new did:sol:zk DID string
 */
export function createDID(identifier: string): DIDString {
  // Validate identifier (alphanumeric, dots, hyphens)
  if (!/^[a-zA-Z0-9.\-_]+$/.test(identifier)) {
    throw new Error(
      `Invalid DID identifier: ${identifier}. Only alphanumeric, dots, hyphens, and underscores allowed.`
    );
  }
  return `did:sol:zk:${identifier}`;
}

/**
 * Parse a DID string into components
 */
export function parseDID(did: string): {
  method: string;
  methodSpecificId: string;
  fragment?: string;
  query?: string;
} {
  const didRegex = /^did:([a-z0-9]+):([^#?]+)(?:\?([^#]*))?(?:#(.*))?$/;
  const match = did.match(didRegex);

  if (!match) {
    throw new Error(`Invalid DID format: ${did}`);
  }

  const [, method, methodSpecificId, query, fragment] = match;

  // Validate did:sol:zk method
  if (method !== 'sol' || !methodSpecificId.startsWith('zk:')) {
    throw new Error(`Unsupported DID method: did:${method}:${methodSpecificId}`);
  }

  return {
    method: `${method}:zk`,
    methodSpecificId: methodSpecificId.replace('zk:', ''),
    query,
    fragment,
  };
}

/**
 * Create a minimal DID document
 */
export function createMinimalDIDDocument(
  did: DIDString,
  publicKeyJwk: P256PublicKeyJwk
): AlexSovereignDIDDocument {
  const keyId = `${did}#key-1`;

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
      'https://discard.app/ns/did/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk,
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    recoveryThreshold: 2,
    recoveryGuardians: [],
    service: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

/**
 * Canonicalize DID document for hashing (deterministic JSON)
 */
export function canonicalizeDIDDocument(doc: DIDDocument): string {
  // Sort keys recursively for deterministic output
  const sortedDoc = JSON.parse(
    JSON.stringify(doc, (_, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value)
          .sort()
          .reduce(
            (sorted, key) => {
              sorted[key] = value[key];
              return sorted;
            },
            {} as Record<string, unknown>
          );
      }
      return value;
    })
  );

  return JSON.stringify(sortedDoc);
}

/**
 * Extract verification method by ID
 */
export function getVerificationMethod(
  doc: DIDDocument,
  id: string
): VerificationMethod | undefined {
  // Normalize ID (could be full DID URL or fragment reference)
  const normalizedId = id.startsWith('#') ? `${doc.id}${id}` : id;
  const fragmentId = id.startsWith('#') ? id : `#${id.split('#')[1] || ''}`;

  return doc.verificationMethod?.find(
    (vm) => vm.id === normalizedId || vm.id === fragmentId
  );
}

/**
 * Check if DID document has recovery capability
 */
export function hasRecoveryCapability(
  doc: AlexSovereignDIDDocument
): boolean {
  const threshold = doc.recoveryThreshold ?? 0;
  const activeGuardians =
    doc.recoveryGuardians?.filter((g) => g.status === 'active').length ?? 0;
  return activeGuardians >= threshold && threshold > 0;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isDIDString(value: unknown): value is DIDString {
  return typeof value === 'string' && value.startsWith('did:sol:zk:');
}

export function isP256PublicKeyJwk(
  value: unknown
): value is P256PublicKeyJwk {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as P256PublicKeyJwk).kty === 'EC' &&
    (value as P256PublicKeyJwk).crv === 'P-256'
  );
}

export function isEd25519PublicKeyJwk(
  value: unknown
): value is Ed25519PublicKeyJwk {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Ed25519PublicKeyJwk).kty === 'OKP' &&
    (value as Ed25519PublicKeyJwk).crv === 'Ed25519'
  );
}
