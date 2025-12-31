/**
 * DisCard 2035 - WebAuthn Stamper
 *
 * Handles biometric authentication via WebAuthn/FIDO2 for
 * transaction signing approval in the TEE.
 */

import { WebauthnStamper } from "@turnkey/webauthn-stamper";

// ============================================================================
// Types
// ============================================================================

export interface StamperConfig {
  rpId: string; // Relying Party ID (e.g., "discard.app")
  rpName?: string;
  timeout?: number; // Timeout in milliseconds
}

export interface Stamp {
  stampHeaderName: string;
  stampHeaderValue: string;
}

export interface BiometricAuthResult {
  success: boolean;
  stamp?: Stamp;
  credentialId?: string;
  error?: string;
}

// ============================================================================
// DisCard Stamper Class
// ============================================================================

export class DisCardStamper {
  private config: Required<StamperConfig>;
  private stamper: WebauthnStamper;
  private credentialId: string | null = null;

  constructor(config: StamperConfig) {
    this.config = {
      rpId: config.rpId,
      rpName: config.rpName ?? "DisCard",
      timeout: config.timeout ?? 60000,
    };

    this.stamper = new WebauthnStamper({
      rpId: this.config.rpId,
    });
  }

  // ==========================================================================
  // Stamp Creation
  // ==========================================================================

  /**
   * Create a stamp for a payload with biometric authentication
   */
  async stamp(payload: string): Promise<Stamp> {
    try {
      const stamp = await this.stamper.stamp(payload);
      return stamp;
    } catch (error) {
      throw new Error(`Failed to create stamp: ${error}`);
    }
  }

  /**
   * Authenticate and stamp in one operation
   */
  async authenticateAndStamp(payload: string): Promise<BiometricAuthResult> {
    try {
      const stamp = await this.stamp(payload);
      return {
        success: true,
        stamp,
        credentialId: this.credentialId ?? undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed",
      };
    }
  }

  // ==========================================================================
  // Passkey Management
  // ==========================================================================

  /**
   * Register a new passkey for the user
   */
  async registerPasskey(userId: string, displayName: string): Promise<{
    credentialId: string;
    publicKey: ArrayBuffer;
    attestation: AuthenticatorAttestationResponse;
  }> {
    // Generate random challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Create credential
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: this.config.rpName,
          id: this.config.rpId,
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: displayName,
          displayName: displayName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256 (P-256)
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
        },
        attestation: "direct",
        timeout: this.config.timeout,
      },
    }) as PublicKeyCredential;

    if (!credential) {
      throw new Error("Failed to create passkey");
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    // Store credential ID
    this.credentialId = credential.id;

    return {
      credentialId: credential.id,
      publicKey: response.getPublicKey()!,
      attestation: response,
    };
  }

  /**
   * Authenticate with an existing passkey
   */
  async authenticate(): Promise<{
    credentialId: string;
    signature: ArrayBuffer;
    authenticatorData: ArrayBuffer;
    clientDataJSON: ArrayBuffer;
  }> {
    // Generate random challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: this.config.rpId,
        userVerification: "required",
        timeout: this.config.timeout,
      },
    }) as PublicKeyCredential;

    if (!credential) {
      throw new Error("Authentication failed");
    }

    const response = credential.response as AuthenticatorAssertionResponse;

    // Store credential ID
    this.credentialId = credential.id;

    return {
      credentialId: credential.id,
      signature: response.signature,
      authenticatorData: response.authenticatorData,
      clientDataJSON: response.clientDataJSON,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if WebAuthn is supported
   */
  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      window.PublicKeyCredential !== undefined &&
      typeof window.PublicKeyCredential === "function"
    );
  }

  /**
   * Check if platform authenticator is available
   */
  static async isPlatformAuthenticatorAvailable(): Promise<boolean> {
    if (!this.isSupported()) {
      return false;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }

  /**
   * Get the current credential ID
   */
  getCredentialId(): string | null {
    return this.credentialId;
  }

  /**
   * Set the credential ID (for resuming sessions)
   */
  setCredentialId(credentialId: string): void {
    this.credentialId = credentialId;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let stamperInstance: DisCardStamper | null = null;

export function getStamper(config?: StamperConfig): DisCardStamper {
  if (!stamperInstance && config) {
    stamperInstance = new DisCardStamper(config);
  }
  if (!stamperInstance) {
    throw new Error("Stamper not initialized. Call with config first.");
  }
  return stamperInstance;
}

export function initializeStamper(config: StamperConfig): DisCardStamper {
  stamperInstance = new DisCardStamper(config);
  return stamperInstance;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert ArrayBuffer to Base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert ArrayBuffer to Base64URL string (for WebAuthn)
 */
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const base64 = arrayBufferToBase64(buffer);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Convert Base64URL string to ArrayBuffer
 */
export function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return base64ToArrayBuffer(paddedBase64);
}
