/**
 * Brain Orchestrator Client
 *
 * REST client for communicating with the Brain Orchestrator CVM.
 * Used for intent parsing and conversation in dev mode.
 */

import { Platform } from "react-native";

// Brain Orchestrator URL - configurable via environment
// Android emulator uses 10.0.2.2 to reach host machine's localhost
const DEFAULT_BRAIN_URL = Platform.OS === "android"
  ? "http://10.0.2.2:8092"
  : "http://localhost:8092";

const BRAIN_URL = process.env.EXPO_PUBLIC_BRAIN_URL || DEFAULT_BRAIN_URL;

// Log the Brain URL on module load for debugging
console.log("[BrainClient] Configured Brain URL:", BRAIN_URL);
console.log("[BrainClient] From env:", process.env.EXPO_PUBLIC_BRAIN_URL);
console.log("[BrainClient] Platform:", Platform.OS);

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
 * Send a message to the Brain Orchestrator for intent parsing
 */
export async function converseWithBrain(
  request: BrainConverseRequest
): Promise<BrainConverseResponse> {
  try {
    console.log("[BrainClient] Sending to Brain:", request.message);

    const response = await fetch(`${BRAIN_URL}/converse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brain API error: ${response.status} - ${errorText}`);
    }

    const result: BrainConverseResponse = await response.json();
    console.log("[BrainClient] Brain response:", result);

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
