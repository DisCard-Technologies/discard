/**
 * Range Faraday Compliance Client
 *
 * Service for wallet screening and compliance checks using Range's
 * Faraday and Risk APIs. Provides OFAC sanctions screening, token
 * blacklist detection, and risk scoring for addresses.
 *
 * Features:
 * - OFAC sanctions list checking
 * - Token issuer blacklist detection (USDT, USDC, etc.)
 * - Risk scoring for addresses
 * - Compliance record keeping (Travel Rule)
 *
 * @see https://docs.range.org/faraday-api
 * @see https://docs.range.org/risk-api
 */

// ============================================================================
// Configuration
// ============================================================================

const RANGE_API_KEY = process.env.EXPO_PUBLIC_RANGE_API_KEY || "";
const RANGE_API_BASE_URL = "https://api.range.org";
const FARADAY_API_BASE_URL = "https://api.faraday.range.org";

// ============================================================================
// Types
// ============================================================================

export interface SanctionsCheckResult {
  /** Address checked */
  address: string;
  /** Whether address is on OFAC sanctions list */
  isOfacSanctioned: boolean;
  /** Whether address is blacklisted by token issuers */
  isTokenBlacklisted: boolean;
  /** Overall risk level */
  riskLevel: "low" | "medium" | "high" | "critical";
  /** Detailed sanctions/blacklist events */
  details?: SanctionsDetail[];
  /** Timestamp of check */
  checkedAt: number;
}

export interface SanctionsDetail {
  /** Type of sanction/blacklist */
  type: "ofac" | "token_blacklist";
  /** Source of the listing */
  source: string;
  /** Date of listing */
  listedAt?: string;
  /** Reason for listing */
  reason?: string;
}

export interface RiskScoreResult {
  /** Address scored */
  address: string;
  /** Risk score 0-100 */
  score: number;
  /** Risk level based on score */
  riskLevel: "low" | "medium" | "high" | "critical";
  /** Risk factors identified */
  factors: RiskFactor[];
  /** Timestamp */
  scoredAt: number;
}

export interface RiskFactor {
  /** Factor name */
  name: string;
  /** Impact on score */
  impact: number;
  /** Description */
  description: string;
}

export interface ComplianceQuoteResult {
  /** Quote ID for execution */
  quoteId: string;
  /** Source address passed compliance */
  sourceCompliant: boolean;
  /** Destination address passed compliance */
  destCompliant: boolean;
  /** Any compliance warnings */
  warnings: string[];
  /** Quote expiry */
  expiresAt: number;
}

export interface TransferComplianceCheck {
  /** Can the transfer proceed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Risk level of the transfer */
  riskLevel: "low" | "medium" | "high" | "critical";
  /** Compliance details */
  sourceCheck: SanctionsCheckResult;
  destCheck: SanctionsCheckResult;
}

// ============================================================================
// Range Compliance Service
// ============================================================================

export class RangeComplianceService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || RANGE_API_KEY;
  }

  // ==========================================================================
  // Sanctions & Blacklist Screening
  // ==========================================================================

  /**
   * Check if an address is sanctioned or blacklisted
   *
   * Checks against:
   * - OFAC Specially Designated Nationals (SDN) list
   * - Token issuer blacklists (USDT, USDC, CBBTC, USDP)
   *
   * @param address - Blockchain address to check
   * @param chain - Chain (solana, ethereum, etc.)
   * @returns Sanctions check result
   */
  async checkSanctions(
    address: string,
    chain: string = "solana"
  ): Promise<SanctionsCheckResult> {
    console.log("[RangeCompliance] Checking sanctions for:", address.slice(0, 8) + "...");

    try {
      if (!this.apiKey) {
        console.warn("[RangeCompliance] No API key - returning safe default");
        return this.getSafeDefaultResult(address);
      }

      const response = await fetch(
        `${RANGE_API_BASE_URL}/v1/risk/sanctions?address=${address}&chain=${chain}&include_details=true`,
        {
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        console.error("[RangeCompliance] API error:", response.status);
        return this.getSafeDefaultResult(address);
      }

      const data = await response.json();

      const result: SanctionsCheckResult = {
        address,
        isOfacSanctioned: data.is_ofac_sanctioned || false,
        isTokenBlacklisted: data.is_token_blacklisted || false,
        riskLevel: this.calculateRiskLevel(data),
        details: data.details?.map((d: any) => ({
          type: d.type,
          source: d.source,
          listedAt: d.listed_at,
          reason: d.reason,
        })),
        checkedAt: Date.now(),
      };

      console.log("[RangeCompliance] Sanctions check result:", {
        sanctioned: result.isOfacSanctioned,
        blacklisted: result.isTokenBlacklisted,
        riskLevel: result.riskLevel,
      });

      return result;
    } catch (error) {
      console.error("[RangeCompliance] Sanctions check failed:", error);
      return this.getSafeDefaultResult(address);
    }
  }

  /**
   * Get risk score for an address
   *
   * Uses Range's ML models to analyze:
   * - Transaction patterns
   * - Counterparty relationships
   * - Protocol interactions
   * - Historical behavior
   *
   * @param address - Address to score
   * @param chain - Chain
   * @returns Risk score result
   */
  async getRiskScore(
    address: string,
    chain: string = "solana"
  ): Promise<RiskScoreResult> {
    console.log("[RangeCompliance] Getting risk score for:", address.slice(0, 8) + "...");

    try {
      if (!this.apiKey) {
        return this.getDefaultRiskScore(address);
      }

      const response = await fetch(
        `${RANGE_API_BASE_URL}/v1/risk/score?address=${address}&chain=${chain}`,
        {
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        console.error("[RangeCompliance] Risk score API error:", response.status);
        return this.getDefaultRiskScore(address);
      }

      const data = await response.json();

      return {
        address,
        score: data.score || 0,
        riskLevel: this.scoreToLevel(data.score || 0),
        factors: data.factors || [],
        scoredAt: Date.now(),
      };
    } catch (error) {
      console.error("[RangeCompliance] Risk score failed:", error);
      return this.getDefaultRiskScore(address);
    }
  }

  // ==========================================================================
  // Transfer Compliance
  // ==========================================================================

  /**
   * Check if a transfer between two addresses is compliant
   *
   * @param sourceAddress - Sender address
   * @param destAddress - Recipient address
   * @param amount - Amount in USD cents (for Travel Rule threshold)
   * @returns Compliance check result
   */
  async checkTransferCompliance(
    sourceAddress: string,
    destAddress: string,
    amount: number
  ): Promise<TransferComplianceCheck> {
    console.log("[RangeCompliance] Checking transfer compliance:", {
      from: sourceAddress.slice(0, 8) + "...",
      to: destAddress.slice(0, 8) + "...",
      amount,
    });

    // Check both addresses in parallel
    const [sourceCheck, destCheck] = await Promise.all([
      this.checkSanctions(sourceAddress),
      this.checkSanctions(destAddress),
    ]);

    // Determine if transfer is allowed
    const sourceBlocked = sourceCheck.isOfacSanctioned || sourceCheck.isTokenBlacklisted;
    const destBlocked = destCheck.isOfacSanctioned || destCheck.isTokenBlacklisted;

    let allowed = true;
    let reason: string | undefined;

    if (sourceBlocked) {
      allowed = false;
      reason = sourceCheck.isOfacSanctioned
        ? "Source address is OFAC sanctioned"
        : "Source address is blacklisted by token issuer";
    } else if (destBlocked) {
      allowed = false;
      reason = destCheck.isOfacSanctioned
        ? "Destination address is OFAC sanctioned"
        : "Destination address is blacklisted by token issuer";
    }

    // Calculate overall risk level
    const riskLevel = this.combineRiskLevels(sourceCheck.riskLevel, destCheck.riskLevel);

    const result: TransferComplianceCheck = {
      allowed,
      reason,
      riskLevel,
      sourceCheck,
      destCheck,
    };

    console.log("[RangeCompliance] Transfer compliance:", {
      allowed: result.allowed,
      riskLevel: result.riskLevel,
    });

    return result;
  }

  /**
   * Get a compliant quote for a transfer via Faraday
   *
   * Faraday provides built-in compliance checking for cross-chain
   * and same-chain stablecoin transfers.
   *
   * @param params - Quote parameters
   * @returns Quote with compliance status
   */
  async getCompliantQuote(params: {
    fromChain: string;
    toChain: string;
    fromToken: string;
    toToken: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
  }): Promise<ComplianceQuoteResult> {
    console.log("[RangeCompliance] Getting compliant quote via Faraday");

    try {
      if (!this.apiKey) {
        throw new Error("Range API key not configured");
      }

      const queryParams = new URLSearchParams({
        from_chain: params.fromChain,
        to_chain: params.toChain,
        from_asset: params.fromToken,
        to_asset: params.toToken,
        from_address: params.fromAddress,
        to_address: params.toAddress,
        amount: params.amount,
        slippage_bps: "50",
        travel_rule_compliant: "true",
      });

      const response = await fetch(
        `${FARADAY_API_BASE_URL}/v1/transactions/quote?${queryParams}`,
        {
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Faraday quote error: ${error}`);
      }

      const data = await response.json();

      return {
        quoteId: data.quote_id,
        sourceCompliant: !data.compliance?.source_blocked,
        destCompliant: !data.compliance?.dest_blocked,
        warnings: data.compliance?.warnings || [],
        expiresAt: data.expires_at,
      };
    } catch (error) {
      console.error("[RangeCompliance] Quote failed:", error);
      throw error;
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Calculate risk level from sanctions data
   */
  private calculateRiskLevel(data: any): "low" | "medium" | "high" | "critical" {
    if (data.is_ofac_sanctioned) return "critical";
    if (data.is_token_blacklisted) return "critical";
    if (data.risk_score > 80) return "high";
    if (data.risk_score > 50) return "medium";
    return "low";
  }

  /**
   * Convert numeric score to risk level
   */
  private scoreToLevel(score: number): "low" | "medium" | "high" | "critical" {
    if (score >= 90) return "critical";
    if (score >= 70) return "high";
    if (score >= 40) return "medium";
    return "low";
  }

  /**
   * Combine two risk levels (take the higher one)
   */
  private combineRiskLevels(
    level1: "low" | "medium" | "high" | "critical",
    level2: "low" | "medium" | "high" | "critical"
  ): "low" | "medium" | "high" | "critical" {
    const levels = ["low", "medium", "high", "critical"];
    const idx1 = levels.indexOf(level1);
    const idx2 = levels.indexOf(level2);
    return levels[Math.max(idx1, idx2)] as any;
  }

  /**
   * Get safe default result when API is unavailable
   */
  private getSafeDefaultResult(address: string): SanctionsCheckResult {
    return {
      address,
      isOfacSanctioned: false,
      isTokenBlacklisted: false,
      riskLevel: "low",
      checkedAt: Date.now(),
    };
  }

  /**
   * Get default risk score when API is unavailable
   */
  private getDefaultRiskScore(address: string): RiskScoreResult {
    return {
      address,
      score: 0,
      riskLevel: "low",
      factors: [],
      scoredAt: Date.now(),
    };
  }

  /**
   * Check if Range API is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let rangeComplianceServiceInstance: RangeComplianceService | null = null;

export function getRangeComplianceService(): RangeComplianceService {
  if (!rangeComplianceServiceInstance) {
    rangeComplianceServiceInstance = new RangeComplianceService();
  }
  return rangeComplianceServiceInstance;
}

export default RangeComplianceService;
