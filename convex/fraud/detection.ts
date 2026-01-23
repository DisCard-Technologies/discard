/**
 * Fraud Detection Module
 *
 * Real-time fraud analysis for transaction authorizations.
 * Ported from: apps/api/src/services/security/fraud-detection.service.ts
 *
 * Features:
 * - Velocity analysis (transaction frequency)
 * - Amount anomaly detection
 * - Geographic anomaly detection
 * - Merchant risk scoring
 * - Pattern analysis (time-based)
 *
 * Risk thresholds:
 * - Score 50+ → Alert
 * - Score 75+ → Freeze card
 * - Score 90+ → Decline transaction
 */
import { internalAction, internalMutation, internalQuery, query } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  type DPConfig,
  getDPConfigFromSettings,
  applyDPToTransactionStats,
  applyDPToVelocityCount,
} from "../lib/differential-privacy";

// ============ TYPES ============

interface FraudAnomaly {
  type: "velocity" | "amount" | "geographic" | "merchant" | "pattern";
  severity: "low" | "medium" | "high";
  details: string;
  confidence: number; // 0-1
}

interface FraudAnalysisResult {
  riskScore: number; // 0-100
  riskLevel: "low" | "medium" | "high" | "critical";
  anomalies: FraudAnomaly[];
  action: "approve" | "decline" | "alert" | "freeze";
}

// ============ CONSTANTS ============

const THRESHOLDS = {
  // Velocity limits
  VELOCITY_LIMIT: 5,           // Max transactions in window
  VELOCITY_WINDOW_MS: 300000,  // 5 minutes

  // Amount thresholds
  AMOUNT_MULTIPLIER: 3,        // 3x average = suspicious
  MIN_TRANSACTIONS_FOR_AMOUNT: 5, // Need 5+ transactions to calculate average

  // Geographic thresholds
  DISTANCE_THRESHOLD_MILES: 500, // 500+ miles = suspicious
  IMPOSSIBLE_SPEED_MPH: 600,   // Faster than commercial flight

  // Risk score thresholds
  RISK_SCORE_ALERT: 50,
  RISK_SCORE_FREEZE: 75,
  RISK_SCORE_DECLINE: 90,
};

// High-risk merchant category codes
const HIGH_RISK_MCC_CODES = [
  "7995",  // Gambling
  "5967",  // Direct Marketing - Inbound Teleservices
  "5122",  // Drugs, Drug Proprietaries
  "5912",  // Drug Stores and Pharmacies
  "5933",  // Pawn Shops
  "6051",  // Non-Financial Institutions - Foreign Currency
  "7273",  // Dating/Escort Services
  "7841",  // Video Tape Rental Stores
];

// Country risk scores (0-30)
const COUNTRY_RISK_SCORES: Record<string, number> = {
  US: 0,
  CA: 0,
  GB: 0,
  DE: 5,
  FR: 5,
  AU: 0,
  JP: 5,
  // High risk countries
  NG: 25,
  RU: 20,
  CN: 15,
  BR: 15,
  IN: 10,
};

// ============ QUERIES ============

/**
 * Get active fraud alerts for the user
 */
export const alerts = query({
  args: {
    cardId: v.optional(v.id("cards")),
  },
  handler: async (ctx, args): Promise<Doc<"fraud">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    // Get user's cards
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const cardIds = cards.map((c) => c._id);

    // Get fraud alerts for user's cards
    let alerts: Doc<"fraud">[] = [];

    for (const cardId of cardIds) {
      if (args.cardId && cardId !== args.cardId) continue;

      const cardAlerts = await ctx.db
        .query("fraud")
        .withIndex("by_card", (q) => q.eq("cardId", cardId))
        .filter((q) =>
          q.and(
            q.gte(q.field("riskScore"), THRESHOLDS.RISK_SCORE_ALERT),
            q.or(
              q.eq(q.field("userFeedback"), undefined),
              q.eq(q.field("userFeedback"), "pending")
            )
          )
        )
        .order("desc")
        .take(50);

      alerts = alerts.concat(cardAlerts);
    }

    // Sort by analysis time
    alerts.sort((a, b) => b.analyzedAt - a.analyzedAt);

    return alerts.slice(0, 50);
  },
});

/**
 * Get fraud metrics for a card
 */
export const cardMetrics = query({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<{
    totalAlerts: number;
    highRiskAlerts: number;
    averageRiskScore: number;
    lastAlertAt: number | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { totalAlerts: 0, highRiskAlerts: 0, averageRiskScore: 0, lastAlertAt: null };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return { totalAlerts: 0, highRiskAlerts: 0, averageRiskScore: 0, lastAlertAt: null };
    }

    // Verify card ownership
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) {
      return { totalAlerts: 0, highRiskAlerts: 0, averageRiskScore: 0, lastAlertAt: null };
    }

    // Get all fraud records for this card
    const fraudRecords = await ctx.db
      .query("fraud")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .collect();

    if (fraudRecords.length === 0) {
      return { totalAlerts: 0, highRiskAlerts: 0, averageRiskScore: 0, lastAlertAt: null };
    }

    const totalAlerts = fraudRecords.filter((f) => f.riskScore >= THRESHOLDS.RISK_SCORE_ALERT).length;
    const highRiskAlerts = fraudRecords.filter((f) => f.riskLevel === "critical" || f.riskLevel === "high").length;
    const averageRiskScore = fraudRecords.reduce((sum, f) => sum + f.riskScore, 0) / fraudRecords.length;
    const lastAlertAt = Math.max(...fraudRecords.map((f) => f.analyzedAt));

    return {
      totalAlerts,
      highRiskAlerts,
      averageRiskScore: Math.round(averageRiskScore),
      lastAlertAt,
    };
  },
});

// ============ MUTATIONS ============

/**
 * Dismiss a fraud alert (false positive)
 */
export const dismissAlert = internalMutation({
  args: {
    fraudId: v.id("fraud"),
    feedback: v.union(v.literal("false_positive"), v.literal("confirmed_fraud")),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.fraudId, {
      userFeedback: args.feedback,
      feedbackAt: Date.now(),
      dismissedAt: args.feedback === "false_positive" ? Date.now() : undefined,
    });
  },
});

/**
 * Record fraud analysis result
 */
export const recordAnalysis = internalMutation({
  args: {
    cardId: v.id("cards"),
    cardContext: v.string(),
    authorizationId: v.optional(v.id("authorizations")),
    marqetaTransactionToken: v.optional(v.string()),
    riskScore: v.number(),
    riskLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    riskFactors: v.object({
      velocityScore: v.number(),
      amountScore: v.number(),
      locationScore: v.number(),
      timeScore: v.number(),
      merchantScore: v.number(),
    }),
    anomalies: v.array(v.object({
      type: v.union(
        v.literal("velocity"),
        v.literal("amount"),
        v.literal("geographic"),
        v.literal("merchant"),
        v.literal("pattern")
      ),
      severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
      details: v.string(),
      confidence: v.number(),
    })),
    action: v.union(
      v.literal("approve"),
      v.literal("decline"),
      v.literal("alert"),
      v.literal("freeze")
    ),
    merchantName: v.optional(v.string()),
    merchantMcc: v.optional(v.string()),
    merchantCountry: v.optional(v.string()),
    amount: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"fraud">> => {
    return await ctx.db.insert("fraud", {
      cardId: args.cardId,
      cardContext: args.cardContext,
      authorizationId: args.authorizationId,
      marqetaTransactionToken: args.marqetaTransactionToken,
      riskScore: args.riskScore,
      riskLevel: args.riskLevel,
      riskFactors: args.riskFactors,
      anomalies: args.anomalies,
      action: args.action,
      merchantName: args.merchantName,
      merchantMcc: args.merchantMcc,
      merchantCountry: args.merchantCountry,
      amount: args.amount,
      analyzedAt: Date.now(),
    });
  },
});

// ============ INTERNAL ACTIONS ============

/**
 * Analyze transaction for fraud
 * This is the main entry point called by authorization processing
 */
export const analyzeTransaction = internalAction({
  args: {
    cardId: v.id("cards"),
    cardContext: v.string(),
    amount: v.number(),
    merchantName: v.string(),
    merchantMcc: v.string(),
    merchantCountry: v.string(),
    merchantCity: v.optional(v.string()),
    merchantLocation: v.optional(v.object({
      lat: v.number(),
      lon: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<FraudAnalysisResult> => {
    const startTime = Date.now();

    // Fetch user's DP configuration if enabled
    const dpConfig = await ctx.runQuery(internal.fraud.detection.getUserDPConfig, {
      cardId: args.cardId,
    });

    // Run all anomaly checks concurrently (pass DP config where applicable)
    const [
      velocityAnomaly,
      amountAnomaly,
      geographicAnomaly,
      merchantAnomaly,
      patternAnomaly,
    ] = await Promise.all([
      checkVelocityAnomaly(ctx, args.cardContext, dpConfig),
      checkAmountAnomaly(ctx, args.cardContext, args.amount, dpConfig),
      checkGeographicAnomaly(ctx, args.cardContext, args.merchantCountry, args.merchantLocation),
      checkMerchantAnomaly(args.merchantMcc, args.merchantName),
      checkPatternAnomaly(),
    ]);

    // Collect anomalies
    const anomalies: FraudAnomaly[] = [];
    if (velocityAnomaly) anomalies.push(velocityAnomaly);
    if (amountAnomaly) anomalies.push(amountAnomaly);
    if (geographicAnomaly) anomalies.push(geographicAnomaly);
    if (merchantAnomaly) anomalies.push(merchantAnomaly);
    if (patternAnomaly) anomalies.push(patternAnomaly);

    // Calculate risk score
    const riskFactors = calculateRiskFactors(anomalies);
    const riskScore = calculateRiskScore(riskFactors);
    const riskLevel = determineRiskLevel(riskScore);
    const action = determineAction(riskScore);

    const result: FraudAnalysisResult = {
      riskScore,
      riskLevel,
      anomalies,
      action,
    };

    // Record analysis if risk is notable
    if (riskScore >= 25) {
      await ctx.runMutation(internal.fraud.detection.recordAnalysis, {
        cardId: args.cardId,
        cardContext: args.cardContext,
        riskScore,
        riskLevel,
        riskFactors,
        anomalies,
        action,
        merchantName: args.merchantName,
        merchantMcc: args.merchantMcc,
        merchantCountry: args.merchantCountry,
        amount: args.amount,
      });
    }

    // Log performance
    const analysisTime = Date.now() - startTime;
    if (analysisTime > 200) {
      console.warn(`Fraud analysis took ${analysisTime}ms for card context ${args.cardContext}`);
    }

    return result;
  },
});

// ============ ANOMALY CHECKERS ============

/**
 * Check for velocity anomaly (too many transactions in short time)
 *
 * When DP is enabled, applies Laplace noise to the velocity count
 * to prevent inference attacks on transaction patterns.
 */
async function checkVelocityAnomaly(
  ctx: any,
  cardContext: string,
  dpConfig?: DPConfig | null
): Promise<FraudAnomaly | null> {
  // Query recent transactions for this card
  // Note: In Convex, we query the database directly instead of Redis

  const windowStart = Date.now() - THRESHOLDS.VELOCITY_WINDOW_MS;

  // Get recent authorizations
  const recentAuths = await ctx.runQuery(internal.fraud.detection.getRecentAuthorizations, {
    cardContext,
    since: windowStart,
  });

  // Apply DP noise to velocity count if enabled
  const recentCount = dpConfig
    ? applyDPToVelocityCount(recentAuths.length, dpConfig)
    : recentAuths.length;

  if (recentCount > THRESHOLDS.VELOCITY_LIMIT) {
    return {
      type: "velocity",
      severity: "high",
      details: `${recentCount} transactions in ${THRESHOLDS.VELOCITY_WINDOW_MS / 60000} minutes exceeds limit of ${THRESHOLDS.VELOCITY_LIMIT}`,
      confidence: dpConfig ? 0.85 : 0.9, // Slightly lower confidence with DP noise
    };
  }

  return null;
}

/**
 * Check for amount anomaly (unusual transaction amount)
 *
 * When DP is enabled, uses noisy statistics to protect spending patterns.
 */
async function checkAmountAnomaly(
  ctx: any,
  cardContext: string,
  amount: number,
  dpConfig?: DPConfig | null
): Promise<FraudAnomaly | null> {
  // Get historical transaction data (with DP noise if enabled)
  const stats = await ctx.runQuery(internal.fraud.detection.getTransactionStats, {
    cardContext,
    dpConfig: dpConfig ? {
      epsilon: dpConfig.epsilon,
      delta: dpConfig.delta,
      sensitivity: dpConfig.sensitivity,
    } : undefined,
  });

  if (!stats || stats.count < THRESHOLDS.MIN_TRANSACTIONS_FOR_AMOUNT) {
    // Not enough history to determine anomaly
    return null;
  }

  const threshold = stats.avgAmount * THRESHOLDS.AMOUNT_MULTIPLIER;

  if (amount > threshold) {
    const multiplier = (amount / stats.avgAmount).toFixed(1);
    return {
      type: "amount",
      severity: amount > threshold * 2 ? "high" : "medium",
      details: `Transaction amount $${(amount / 100).toFixed(2)} is ${multiplier}x the average ($${(stats.avgAmount / 100).toFixed(2)})`,
      confidence: dpConfig ? 0.75 : 0.8, // Slightly lower confidence with DP noise
    };
  }

  return null;
}

/**
 * Check for geographic anomaly (suspicious location)
 */
async function checkGeographicAnomaly(
  ctx: any,
  cardContext: string,
  merchantCountry: string,
  merchantLocation?: { lat: number; lon: number }
): Promise<FraudAnomaly | null> {
  // Check country risk
  const countryRisk = COUNTRY_RISK_SCORES[merchantCountry] ?? 10;

  if (countryRisk >= 20) {
    return {
      type: "geographic",
      severity: countryRisk >= 25 ? "high" : "medium",
      details: `Transaction from high-risk country: ${merchantCountry}`,
      confidence: 0.7,
    };
  }

  // If we have location data, check for impossible travel
  if (merchantLocation) {
    const lastLocation = await ctx.runQuery(internal.fraud.detection.getLastTransactionLocation, {
      cardContext,
    });

    if (lastLocation) {
      const distance = calculateDistance(lastLocation, merchantLocation);
      const timeDiffMinutes = (Date.now() - lastLocation.timestamp) / 60000;

      if (distance > THRESHOLDS.DISTANCE_THRESHOLD_MILES) {
        const speed = timeDiffMinutes > 0 ? distance / (timeDiffMinutes / 60) : Infinity;
        const impossibleSpeed = speed > THRESHOLDS.IMPOSSIBLE_SPEED_MPH;

        return {
          type: "geographic",
          severity: impossibleSpeed ? "high" : "medium",
          details: `Transaction ${distance.toFixed(0)} miles from last location${impossibleSpeed ? " (impossible travel speed)" : ""}`,
          confidence: impossibleSpeed ? 0.95 : 0.7,
        };
      }
    }
  }

  return null;
}

/**
 * Check for merchant anomaly (high-risk merchant)
 */
async function checkMerchantAnomaly(
  merchantMcc: string,
  merchantName: string
): Promise<FraudAnomaly | null> {
  // Check high-risk MCC codes
  if (HIGH_RISK_MCC_CODES.includes(merchantMcc)) {
    return {
      type: "merchant",
      severity: "medium",
      details: `High-risk merchant category: ${merchantMcc}`,
      confidence: 0.6,
    };
  }

  // Check for suspicious merchant names
  const suspiciousPatterns = [
    /crypto/i,
    /bitcoin/i,
    /gambling/i,
    /casino/i,
    /wire\s*transfer/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(merchantName)) {
      return {
        type: "merchant",
        severity: "medium",
        details: `Suspicious merchant name pattern detected: ${merchantName}`,
        confidence: 0.5,
      };
    }
  }

  return null;
}

/**
 * Check for pattern anomaly (unusual time)
 */
async function checkPatternAnomaly(): Promise<FraudAnomaly | null> {
  const hour = new Date().getHours();

  // Flag transactions between 2-5 AM
  if (hour >= 2 && hour <= 5) {
    return {
      type: "pattern",
      severity: "low",
      details: "Transaction during unusual hours (2-5 AM)",
      confidence: 0.4,
    };
  }

  return null;
}

// ============ INTERNAL QUERIES ============

/**
 * Get recent authorizations for velocity check
 *
 * When DP is enabled, the returned count should have Laplace noise applied
 * by the caller to protect velocity patterns.
 */
export const getRecentAuthorizations = internalQuery({
  args: {
    cardContext: v.string(),
    since: v.number(),
  },
  handler: async (ctx, args): Promise<Doc<"authorizations">[]> => {
    return await ctx.db
      .query("authorizations")
      .withIndex("by_card_context", (q) => q.eq("cardContext", args.cardContext))
      .filter((q) => q.gte(q.field("processedAt"), args.since))
      .collect();
  },
});

/**
 * Get user's DP configuration from privacy settings
 */
export const getUserDPConfig = internalQuery({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args): Promise<DPConfig | null> => {
    const card = await ctx.db.get(args.cardId);
    if (!card) return null;

    const user = await ctx.db.get(card.userId);
    if (!user) return null;

    return getDPConfigFromSettings(user.privacySettings);
  },
});

/**
 * Get transaction statistics for amount check
 *
 * When DP is enabled, applies Gaussian noise to protect user behavioral patterns
 * from statistical inference attacks.
 */
export const getTransactionStats = internalQuery({
  args: {
    cardContext: v.string(),
    dpConfig: v.optional(v.object({
      epsilon: v.number(),
      delta: v.number(),
      sensitivity: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<{
    count: number;
    avgAmount: number;
    stdDevAmount: number;
  } | null> => {
    const transactions = await ctx.db
      .query("authorizations")
      .withIndex("by_card_context", (q) => q.eq("cardContext", args.cardContext))
      .filter((q) => q.eq(q.field("status"), "approved"))
      .order("desc")
      .take(100);

    if (transactions.length === 0) {
      return null;
    }

    const amounts = transactions.map((t) => t.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((acc, val) => acc + Math.pow(val - avgAmount, 2), 0) / amounts.length;
    const stdDevAmount = Math.sqrt(variance);

    const stats = {
      count: transactions.length,
      avgAmount,
      stdDevAmount,
    };

    // Apply differential privacy noise if config provided
    if (args.dpConfig) {
      return applyDPToTransactionStats(stats, args.dpConfig);
    }

    return stats;
  },
});

/**
 * Get last transaction location
 */
export const getLastTransactionLocation = internalQuery({
  args: {
    cardContext: v.string(),
  },
  handler: async (ctx, args): Promise<{
    lat: number;
    lon: number;
    timestamp: number;
  } | null> => {
    // Note: We would need to store location data with transactions
    // For now, return null as location tracking is not implemented
    return null;
  },
});

// ============ HELPER FUNCTIONS ============

/**
 * Calculate risk factors from anomalies
 */
function calculateRiskFactors(anomalies: FraudAnomaly[]): {
  velocityScore: number;
  amountScore: number;
  locationScore: number;
  timeScore: number;
  merchantScore: number;
} {
  const factors = {
    velocityScore: 0,
    amountScore: 0,
    locationScore: 0,
    timeScore: 0,
    merchantScore: 0,
  };

  for (const anomaly of anomalies) {
    const severityMultiplier =
      anomaly.severity === "high" ? 3 :
      anomaly.severity === "medium" ? 2 : 1;

    const score = severityMultiplier * anomaly.confidence * 30;

    switch (anomaly.type) {
      case "velocity":
        factors.velocityScore = Math.max(factors.velocityScore, score);
        break;
      case "amount":
        factors.amountScore = Math.max(factors.amountScore, score);
        break;
      case "geographic":
        factors.locationScore = Math.max(factors.locationScore, score);
        break;
      case "pattern":
        factors.timeScore = Math.max(factors.timeScore, score);
        break;
      case "merchant":
        factors.merchantScore = Math.max(factors.merchantScore, score);
        break;
    }
  }

  return factors;
}

/**
 * Calculate overall risk score from factors
 */
function calculateRiskScore(factors: {
  velocityScore: number;
  amountScore: number;
  locationScore: number;
  timeScore: number;
  merchantScore: number;
}): number {
  // Weighted average
  const weights = {
    velocity: 0.30,
    amount: 0.25,
    location: 0.20,
    time: 0.10,
    merchant: 0.15,
  };

  const score =
    factors.velocityScore * weights.velocity +
    factors.amountScore * weights.amount +
    factors.locationScore * weights.location +
    factors.timeScore * weights.time +
    factors.merchantScore * weights.merchant;

  return Math.min(100, Math.round(score));
}

/**
 * Determine risk level from score
 */
function determineRiskLevel(riskScore: number): "low" | "medium" | "high" | "critical" {
  if (riskScore >= 75) return "critical";
  if (riskScore >= 50) return "high";
  if (riskScore >= 25) return "medium";
  return "low";
}

/**
 * Determine action from risk score
 */
function determineAction(riskScore: number): "approve" | "decline" | "alert" | "freeze" {
  if (riskScore >= THRESHOLDS.RISK_SCORE_DECLINE) return "decline";
  if (riskScore >= THRESHOLDS.RISK_SCORE_FREEZE) return "freeze";
  if (riskScore >= THRESHOLDS.RISK_SCORE_ALERT) return "alert";
  return "approve";
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  loc1: { lat: number; lon: number },
  loc2: { lat: number; lon: number }
): number {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLon = toRad(loc2.lon - loc1.lon);
  const lat1 = toRad(loc1.lat);
  const lat2 = toRad(loc2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
