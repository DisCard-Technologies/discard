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

const RANGE_API_KEY = process.env.EXPO_PUBLIC_RANGE_API_KEY || process.env.RANGE_API_KEY || "";
const RANGE_API_BASE_URL = "https://api.range.org";
const FARADAY_API_BASE_URL = "https://api.faraday.range.org";

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Minimum delay between API requests in milliseconds */
const MIN_REQUEST_DELAY_MS = 200;

/** Max retries for rate-limited requests */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff in milliseconds */
const BACKOFF_BASE_MS = 1000;

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

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class RangeComplianceService {
  private apiKey: string;
  private sanctionsCache: Map<string, CacheEntry<SanctionsCheckResult>> = new Map();
  private riskScoreCache: Map<string, CacheEntry<RiskScoreResult>> = new Map();
  private inFlightRequests: Map<string, Promise<any>> = new Map();
  private lastRequestTime: number = 0;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || RANGE_API_KEY;
  }

  // ==========================================================================
  // Rate Limiting & Caching Helpers
  // ==========================================================================

  /**
   * Wait to respect rate limits
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_DELAY_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_DELAY_MS - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Sleep for exponential backoff
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get cached result if valid
   */
  private getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data;
    }
    if (entry) {
      cache.delete(key);
    }
    return null;
  }

  /**
   * Set cache entry
   */
  private setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
    cache.set(key, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  /**
   * Deduplicate in-flight requests
   */
  private async dedupeRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    const inFlight = this.inFlightRequests.get(key);
    if (inFlight) {
      console.log("[RangeCompliance] Deduplicating request for:", key.slice(0, 16) + "...");
      return inFlight;
    }

    const promise = requestFn().finally(() => {
      this.inFlightRequests.delete(key);
    });

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  /**
   * Fetch with retry and exponential backoff for rate limiting
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries: number = MAX_RETRIES
  ): Promise<Response> {
    await this.throttle();

    const response = await fetch(url, options);

    if (response.status === 429 && retries > 0) {
      const retryAfter = response.headers.get("Retry-After");
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BACKOFF_BASE_MS * Math.pow(2, MAX_RETRIES - retries);

      console.log(`[RangeCompliance] Rate limited, retrying in ${delay}ms (${retries} retries left)`);
      await this.sleep(delay);
      return this.fetchWithRetry(url, options, retries - 1);
    }

    return response;
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
    const cacheKey = `${chain}:${address}`;

    // Check cache first
    const cached = this.getCached(this.sanctionsCache, cacheKey);
    if (cached) {
      console.log("[RangeCompliance] Cache hit for:", address.slice(0, 8) + "...");
      return cached;
    }

    // Deduplicate concurrent requests for the same address
    return this.dedupeRequest(cacheKey, () => this.checkSanctionsInternal(address, chain, cacheKey));
  }

  /**
   * Internal sanctions check (called after cache/dedup checks)
   */
  private async checkSanctionsInternal(
    address: string,
    chain: string,
    cacheKey: string
  ): Promise<SanctionsCheckResult> {
    console.log("[RangeCompliance] Checking sanctions for:", address.slice(0, 8) + "...");

    try {
      if (!this.apiKey) {
        throw new Error("Range API key not configured — cannot perform compliance check");
      }

      const response = await this.fetchWithRetry(
        `${RANGE_API_BASE_URL}/v1/risk/sanctions?address=${address}&chain=${chain}&include_details=true`,
        {
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Compliance API error (HTTP ${response.status})`);
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

      // Cache the result
      this.setCache(this.sanctionsCache, cacheKey, result);

      console.log("[RangeCompliance] Sanctions check result:", {
        sanctioned: result.isOfacSanctioned,
        blacklisted: result.isTokenBlacklisted,
        riskLevel: result.riskLevel,
      });

      return result;
    } catch (error) {
      console.error("[RangeCompliance] Sanctions check failed:", error);
      throw error;
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
    const cacheKey = `risk:${chain}:${address}`;

    // Check cache first
    const cached = this.getCached(this.riskScoreCache, cacheKey);
    if (cached) {
      console.log("[RangeCompliance] Risk score cache hit for:", address.slice(0, 8) + "...");
      return cached;
    }

    // Deduplicate concurrent requests
    return this.dedupeRequest(cacheKey, () => this.getRiskScoreInternal(address, chain, cacheKey));
  }

  /**
   * Internal risk score fetch (called after cache/dedup checks)
   */
  private async getRiskScoreInternal(
    address: string,
    chain: string,
    cacheKey: string
  ): Promise<RiskScoreResult> {
    console.log("[RangeCompliance] Getting risk score for:", address.slice(0, 8) + "...");

    try {
      if (!this.apiKey) {
        return this.getDefaultRiskScore(address);
      }

      const response = await this.fetchWithRetry(
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

      const result: RiskScoreResult = {
        address,
        score: data.score || 0,
        riskLevel: this.scoreToLevel(data.score || 0),
        factors: data.factors || [],
        scoredAt: Date.now(),
      };

      // Cache the result
      this.setCache(this.riskScoreCache, cacheKey, result);

      return result;
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

  /**
   * Clear all caches (useful for testing or when addresses need rechecking)
   */
  clearCache(): void {
    this.sanctionsCache.clear();
    this.riskScoreCache.clear();
    console.log("[RangeCompliance] Cache cleared");
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { sanctionsEntries: number; riskScoreEntries: number } {
    return {
      sanctionsEntries: this.sanctionsCache.size,
      riskScoreEntries: this.riskScoreCache.size,
    };
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
