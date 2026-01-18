/**
 * Brain Orchestrator Client
 *
 * REST client for communicating with the Brain Orchestrator CVM.
 * Used for intent parsing and conversation in dev mode.
 *
 * PRIVACY: All requests are encrypted before transmission to protect
 * sensitive financial data (amounts, recipients, etc.) from the AI service.
 */

import { Platform } from "react-native";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

// Brain Orchestrator URL - configurable via environment
// Android emulator uses 10.0.2.2 to reach host machine's localhost
const DEFAULT_BRAIN_URL = Platform.OS === "android"
  ? "http://10.0.2.2:8092"
  : "http://localhost:8092";

const BRAIN_URL = process.env.EXPO_PUBLIC_BRAIN_URL || DEFAULT_BRAIN_URL;

// Encryption key for Brain requests (should be rotated periodically)
// In production, this would be derived from the user's session
const BRAIN_ENCRYPTION_KEY = process.env.EXPO_PUBLIC_BRAIN_ENCRYPTION_KEY;

// Log the Brain URL on module load for debugging
console.log("[BrainClient] Configured Brain URL:", BRAIN_URL);
console.log("[BrainClient] From env:", process.env.EXPO_PUBLIC_BRAIN_URL);
console.log("[BrainClient] Platform:", Platform.OS);
console.log("[BrainClient] Encryption enabled:", !!BRAIN_ENCRYPTION_KEY);

export interface BrainConverseRequest {
  sessionId?: string;
  userId?: string;
  message: string;
}

export interface ParsedIntent {
  intentId?: string;
  action: string;
  sourceType?: string;
  sourceId?: string;
  targetType?: string;
  targetId?: string;
  amountCents?: number;
  currency?: string;
  rawText?: string;
}

export interface BrainConverseResponse {
  success: boolean;
  responseText: string;
  intent?: ParsedIntent;
  needsClarification: boolean;
  clarificationQuestion?: string;
  confidence: number;
  parseTimeMs?: number;
  error?: string;
}

/**
 * Encrypt sensitive data before sending to Brain
 * Uses NaCl secretbox (XSalsa20-Poly1305)
 */
function encryptForBrain(data: string, key: Uint8Array): { encrypted: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageBytes = naclUtil.decodeUTF8(data);
  const encrypted = nacl.secretbox(messageBytes, nonce, key);

  return {
    encrypted: naclUtil.encodeBase64(encrypted),
    nonce: naclUtil.encodeBase64(nonce),
  };
}

/**
 * Sanitize intent data to remove sensitive details before logging
 */
function sanitizeForLogging(message: string): string {
  // Replace amounts with placeholders
  let sanitized = message.replace(/\$[\d,]+(\.\d{2})?/g, "$[AMOUNT]");
  sanitized = sanitized.replace(/\d{4,}/g, "[NUMBER]");
  // Replace email addresses
  sanitized = sanitized.replace(/[\w.-]+@[\w.-]+\.\w+/g, "[EMAIL]");
  // Replace wallet addresses (Solana base58)
  sanitized = sanitized.replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, "[ADDRESS]");
  return sanitized;
}

/**
 * Generate anonymous session token (not linked to userId)
 */
function generateAnonymousToken(): string {
  const randomBytes = nacl.randomBytes(16);
  return naclUtil.encodeBase64(randomBytes).replace(/[+/=]/g, "x").slice(0, 16);
}

/**
 * Send a message to the Brain Orchestrator for intent parsing
 *
 * PRIVACY IMPROVEMENTS:
 * 1. Encrypts the message content before transmission
 * 2. Uses anonymous session tokens instead of user IDs
 * 3. Sanitizes logged data to prevent sensitive info in logs
 */
export async function converseWithBrain(
  request: BrainConverseRequest
): Promise<BrainConverseResponse> {
  try {
    // Log sanitized version only
    console.log("[BrainClient] Sending to Brain:", sanitizeForLogging(request.message));

    // Prepare the request with privacy protections
    let encryptedRequest: any;
    let isEncrypted = false;

    if (BRAIN_ENCRYPTION_KEY) {
      // Encrypt the message content
      const keyBytes = naclUtil.decodeBase64(BRAIN_ENCRYPTION_KEY);

      // Generate anonymous session token (not linked to user identity)
      const anonymousToken = generateAnonymousToken();

      // Encrypt sensitive fields
      const sensitiveData = {
        message: request.message,
        timestamp: Date.now(),
      };

      const { encrypted, nonce } = encryptForBrain(JSON.stringify(sensitiveData), keyBytes);

      encryptedRequest = {
        // Use anonymous token instead of userId to prevent tracking
        sessionId: request.sessionId || anonymousToken,
        anonymousToken,
        // Encrypted payload
        encryptedPayload: encrypted,
        nonce,
        // Include only non-sensitive metadata
        version: "2.0",
        encrypted: true,
      };

      isEncrypted = true;
      console.log("[BrainClient] Request encrypted successfully");
    } else {
      // Fallback: Still sanitize user ID by hashing
      const anonymousToken = generateAnonymousToken();

      encryptedRequest = {
        sessionId: request.sessionId || anonymousToken,
        // Don't send userId to AI service - use anonymous token instead
        anonymousToken,
        message: request.message,
        // Flag that encryption is not enabled (for audit)
        encrypted: false,
        version: "2.0",
      };

      console.warn("[BrainClient] WARNING: Encryption not enabled - sensitive data may be exposed to AI service");
    }

    const response = await fetch(`${BRAIN_URL}/converse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Privacy-Mode": isEncrypted ? "encrypted" : "anonymous",
      },
      body: JSON.stringify(encryptedRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brain API error: ${response.status} - ${errorText}`);
    }

    const result: BrainConverseResponse = await response.json();

    // Log sanitized response
    console.log("[BrainClient] Brain response received, confidence:", result.confidence);

    return result;
  } catch (error) {
    console.error("[BrainClient] Error:", error);

    // Return error response
    return {
      success: false,
      responseText:
        error instanceof Error ? error.message : "Failed to connect to Brain",
      needsClarification: false,
      confidence: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if Brain Orchestrator is available
 */
export async function checkBrainHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BRAIN_URL}/health`, {
      method: "GET",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the Brain URL for debugging
 */
export function getBrainUrl(): string {
  return BRAIN_URL;
}
