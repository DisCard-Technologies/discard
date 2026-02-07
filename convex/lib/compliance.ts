/**
 * Server-Side Compliance Screening for Convex Actions
 *
 * Lightweight sanctions/blacklist check using Range API.
 * Runs in Convex action runtime (fetch-based, no Node.js APIs).
 *
 * Policy: FAIL-CLOSED — if the API is unreachable, the check fails.
 * This prevents sanctioned addresses from exploiting API outages.
 */

// ============================================================================
// Configuration
// ============================================================================

const RANGE_API_KEY = process.env.RANGE_API_KEY || "";
const RANGE_API_BASE_URL = "https://api.range.org";
const CHECK_TIMEOUT_MS = 10_000; // 10 second timeout

// ============================================================================
// Types
// ============================================================================

export interface ComplianceResult {
  /** Whether the address passed screening */
  passed: boolean;
  /** Reason for failure (if any) */
  reason?: string;
  /** Risk level */
  riskLevel: "low" | "medium" | "high" | "critical";
  /** Whether the check actually ran (false = API unavailable) */
  checkedLive: boolean;
}

// ============================================================================
// Screening
// ============================================================================

/**
 * Screen an address for OFAC sanctions and token blacklists.
 *
 * FAIL-CLOSED: Returns `passed: false` if the API is unreachable.
 */
export async function screenAddress(
  address: string,
  chain: string = "solana"
): Promise<ComplianceResult> {
  if (!RANGE_API_KEY) {
    console.warn("[Compliance] RANGE_API_KEY not configured — blocking transfer (fail-closed)");
    return {
      passed: false,
      reason: "Compliance service not configured",
      riskLevel: "critical",
      checkedLive: false,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

    const response = await fetch(
      `${RANGE_API_BASE_URL}/v1/risk/sanctions?address=${encodeURIComponent(address)}&chain=${chain}&include_details=true`,
      {
        headers: {
          "Authorization": `Bearer ${RANGE_API_KEY}`,
          "Accept": "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[Compliance] Range API returned ${response.status} for ${address.slice(0, 8)}...`);
      return {
        passed: false,
        reason: `Compliance API error (HTTP ${response.status})`,
        riskLevel: "critical",
        checkedLive: false,
      };
    }

    const data = await response.json();

    const isOfacSanctioned = data.is_ofac_sanctioned || false;
    const isTokenBlacklisted = data.is_token_blacklisted || false;

    if (isOfacSanctioned) {
      console.warn(`[Compliance] OFAC sanctioned address blocked: ${address.slice(0, 8)}...`);
      return {
        passed: false,
        reason: "Address is OFAC sanctioned",
        riskLevel: "critical",
        checkedLive: true,
      };
    }

    if (isTokenBlacklisted) {
      console.warn(`[Compliance] Blacklisted address blocked: ${address.slice(0, 8)}...`);
      return {
        passed: false,
        reason: "Address is blacklisted by token issuer",
        riskLevel: "critical",
        checkedLive: true,
      };
    }

    // Determine risk level from score
    const score = data.risk_score || 0;
    const riskLevel: ComplianceResult["riskLevel"] =
      score >= 90 ? "critical" :
      score >= 70 ? "high" :
      score >= 40 ? "medium" : "low";

    return {
      passed: true,
      riskLevel,
      checkedLive: true,
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    console.error(
      `[Compliance] Screening failed for ${address.slice(0, 8)}...:`,
      isTimeout ? "timeout" : error
    );

    // FAIL-CLOSED: block on any error
    return {
      passed: false,
      reason: isTimeout ? "Compliance check timed out" : "Compliance check failed",
      riskLevel: "critical",
      checkedLive: false,
    };
  }
}
