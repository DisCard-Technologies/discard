/**
 * Data Transformation Script
 *
 * Transforms exported Supabase data to Convex format.
 * Run with: npx ts-node convex/migrations/transform-data.ts
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const INPUT_DIR = path.join(__dirname, "exports");
const OUTPUT_DIR = path.join(__dirname, "convex-ready");

// ID mapping tables (Supabase UUID -> Convex ID placeholder)
const idMaps = {
  users: new Map<string, string>(),
  cards: new Map<string, string>(),
  wallets: new Map<string, string>(),
  authorizations: new Map<string, string>(),
  defi: new Map<string, string>(),
};

/**
 * Generate a placeholder ID for Convex import
 */
function generatePlaceholderId(type: string, index: number): string {
  return `__${type}_${index}__`;
}

/**
 * Convert Supabase timestamp to Unix milliseconds
 */
function toUnixMs(timestamp: string | null): number {
  if (!timestamp) return Date.now();
  return new Date(timestamp).getTime();
}

/**
 * Read JSON file from exports directory
 */
function readExport<T>(filename: string): T[] {
  const filePath = path.join(INPUT_DIR, `${filename}.json`);
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filePath} not found, returning empty array`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Write transformed data to output directory
 */
function writeOutput(filename: string, data: any[]): void {
  const filePath = path.join(OUTPUT_DIR, `${filename}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  Wrote ${data.length} records to ${filename}.json`);
}

// ============ TRANSFORMERS ============

/**
 * Transform users table
 */
function transformUsers(): void {
  console.log("Transforming users...");

  const supabaseUsers = readExport<any>("users");
  const convexUsers: any[] = [];

  supabaseUsers.forEach((user, index) => {
    const placeholderId = generatePlaceholderId("users", index);
    idMaps.users.set(user.id, placeholderId);

    convexUsers.push({
      _placeholder_id: placeholderId,
      _supabase_id: user.id,

      // Passkey fields (to be populated on first re-auth)
      credentialId: `migrated_${user.id}`,
      publicKey: new Uint8Array(0), // Empty until passkey registration
      solanaAddress: null,

      // Profile
      displayName: user.username || user.email?.split("@")[0] || null,
      phoneHash: null,
      email: user.email,

      // Privacy settings
      privacySettings: {
        dataRetention: user.privacy_settings?.retention_days || 365,
        analyticsOptOut: user.privacy_settings?.analytics_opt_out || false,
        transactionIsolation: true,
      },

      // Account status
      kycStatus: mapKycStatus(user.kyc_status),
      riskScore: 0,
      accountStatus: user.locked_until
        ? "locked"
        : user.is_verified
          ? "active"
          : "suspended",

      // Timestamps
      lastActive: toUnixMs(user.last_active || user.last_login),
      createdAt: toUnixMs(user.created_at),
    });
  });

  writeOutput("users", convexUsers);
}

function mapKycStatus(status: string | null): string {
  switch (status) {
    case "approved":
    case "verified":
      return "verified";
    case "pending":
      return "pending";
    case "rejected":
      return "rejected";
    default:
      return "none";
  }
}

/**
 * Transform cards table
 */
function transformCards(): void {
  console.log("Transforming cards...");

  const supabaseCards = readExport<any>("cards");
  const visaDetails = readExport<any>("visa_card_details");

  // Create lookup for Visa details
  const visaLookup = new Map<string, any>();
  for (const visa of visaDetails) {
    visaLookup.set(visa.card_id, visa);
  }

  const convexCards: any[] = [];

  supabaseCards.forEach((card, index) => {
    const placeholderId = generatePlaceholderId("cards", index);
    idMaps.cards.set(card.id, placeholderId);

    const visa = visaLookup.get(card.id);

    convexCards.push({
      _placeholder_id: placeholderId,
      _supabase_id: card.id,
      _supabase_card_id: card.card_id,
      userId: idMaps.users.get(card.user_id) || null,

      // Card identity
      cardContext: card.card_context_hash || crypto.randomUUID(),
      marqetaCardToken: card.marqeta_card_token || visa?.marqeta_card_token,
      marqetaUserToken: null, // Will be set during re-provisioning

      // Card details
      last4: visa?.last_four_digits || "0000",
      expirationMonth: visa?.expiration_month || 12,
      expirationYear: visa?.expiration_year || 2030,
      cardType: "virtual",

      // Limits (convert to cents if not already)
      spendingLimit: card.spending_limit || 50000,
      dailyLimit: card.spending_limit ? card.spending_limit * 10 : 500000,
      monthlyLimit: card.spending_limit ? card.spending_limit * 100 : 5000000,
      currentBalance: card.current_balance || 0,
      reservedBalance: 0,
      overdraftLimit: 0,

      // Status
      status: mapCardStatus(card.status, visa?.provisioning_status),

      // Restrictions
      allowedMccCodes: null,
      blockedMccCodes: card.merchant_restrictions || null,
      blockedCountries: null,

      // Self-healing
      breachDetectedAt: null,
      breachSource: null,
      reissuedFrom: null,
      reissuedTo: null,

      // Privacy
      privacyIsolated: true,

      // Metadata
      nickname: card.nickname || null,
      color: null,

      // Timestamps
      createdAt: toUnixMs(card.created_at),
      updatedAt: toUnixMs(card.updated_at),
      lastUsedAt: null,
    });
  });

  writeOutput("cards", convexCards);
}

function mapCardStatus(
  status: string | null,
  provisioningStatus: string | null
): string {
  if (provisioningStatus === "pending") return "pending";
  switch (status) {
    case "active":
      return "active";
    case "paused":
      return "paused";
    case "frozen":
      return "frozen";
    case "expired":
    case "deleted":
      return "terminated";
    default:
      return "pending";
  }
}

/**
 * Transform wallets table
 */
function transformWallets(): void {
  console.log("Transforming wallets...");

  const supabaseWallets = readExport<any>("crypto_wallets");
  const convexWallets: any[] = [];

  supabaseWallets.forEach((wallet, index) => {
    const placeholderId = generatePlaceholderId("wallets", index);
    idMaps.wallets.set(wallet.id, placeholderId);

    convexWallets.push({
      _placeholder_id: placeholderId,
      _supabase_id: wallet.id,
      _supabase_wallet_id: wallet.wallet_id,
      userId: idMaps.users.get(wallet.user_id) || null,

      // Wallet identification
      walletType: mapWalletType(wallet.wallet_type),

      // Address (encrypted data needs re-encryption)
      address: wallet.wallet_address_hash || "unknown",
      encryptedPrivateData: null, // Will need re-encryption
      addressLastFour: wallet.wallet_address_hash?.slice(-4) || "0000",

      // Network
      networkType: mapNetworkType(wallet.wallet_type),
      chainId: wallet.wallet_type === "ethereum" ? 1 : null,

      // Balance (will be synced fresh)
      cachedBalance: null,
      cachedBalanceUsd: null,
      balanceLastUpdated: null,

      // Connection state
      connectionStatus: mapConnectionStatus(wallet.connection_status),
      sessionExpiry: toUnixMs(wallet.session_expiry),

      // WalletConnect
      wcTopic: wallet.topic || null,
      wcPeerMetadata: null,

      // Permissions
      permissions: wallet.permissions || ["sign_transaction"],

      // User preferences
      isDefault: false,
      nickname: wallet.wallet_name || null,

      // Timestamps
      createdAt: toUnixMs(wallet.created_at),
      lastUsedAt: toUnixMs(wallet.last_balance_check),
    });
  });

  writeOutput("wallets", convexWallets);
}

function mapWalletType(type: string): string {
  switch (type) {
    case "metamask":
      return "eth_external";
    case "walletconnect":
      return "walletconnect";
    case "bitcoin":
      return "bitcoin";
    case "hardware":
      return "eth_external";
    default:
      return "solana_external";
  }
}

function mapNetworkType(walletType: string): string {
  switch (walletType) {
    case "metamask":
    case "walletconnect":
      return "ethereum";
    case "bitcoin":
      return "bitcoin";
    default:
      return "solana";
  }
}

function mapConnectionStatus(status: string | null): string {
  switch (status) {
    case "connected":
      return "connected";
    case "expired":
      return "expired";
    default:
      return "disconnected";
  }
}

/**
 * Transform authorizations table
 */
function transformAuthorizations(): void {
  console.log("Transforming authorizations...");

  const supabaseAuths = readExport<any>("authorization_transactions");
  const convexAuths: any[] = [];

  supabaseAuths.forEach((auth, index) => {
    const placeholderId = generatePlaceholderId("authorizations", index);
    idMaps.authorizations.set(auth.authorization_id, placeholderId);

    // Find card by context
    let cardPlaceholderId = null;
    for (const [supabaseId, placeholderId] of idMaps.cards.entries()) {
      // This would need the card context lookup in real implementation
      cardPlaceholderId = placeholderId;
      break;
    }

    convexAuths.push({
      _placeholder_id: placeholderId,
      _supabase_id: auth.authorization_id,
      cardId: cardPlaceholderId,
      cardContext: auth.card_context,

      // Marqeta reference
      marqetaTransactionToken: auth.marqeta_transaction_token,
      authorizationCode: auth.authorization_code,

      // Transaction details
      amount: Math.round(
        (parseFloat(auth.authorization_amount) || 0) * 100
      ),
      currencyCode: auth.currency_code || "USD",
      convertedAmount: auth.converted_amount
        ? Math.round(parseFloat(auth.converted_amount) * 100)
        : null,
      exchangeRate: auth.exchange_rate
        ? parseFloat(auth.exchange_rate)
        : null,

      // Merchant
      merchantName: auth.merchant_name || "Unknown",
      merchantMcc: auth.merchant_category_code || "0000",
      merchantCountry: auth.merchant_location_country,
      merchantCity: auth.merchant_location_city,
      merchantId: null,

      // Status
      status: mapAuthStatus(auth.status),
      declineReason: auth.decline_reason,
      declineCode: auth.decline_code,

      // Performance
      responseTimeMs: auth.response_time_ms || 0,

      // Risk
      riskScore: auth.risk_score || 0,
      riskLevel: mapRiskLevel(auth.risk_score),

      // Retry
      retryCount: auth.retry_count || 0,

      // Timestamps
      processedAt: toUnixMs(auth.processed_at || auth.created_at),
      expiresAt: toUnixMs(auth.expires_at) || Date.now() + 7 * 24 * 60 * 60 * 1000,
      settledAt: auth.status === "settled" ? toUnixMs(auth.created_at) : null,
    });
  });

  writeOutput("authorizations", convexAuths);
}

function mapAuthStatus(status: string | null): string {
  switch (status) {
    case "approved":
      return "approved";
    case "declined":
      return "declined";
    case "expired":
      return "expired";
    case "reversed":
      return "reversed";
    case "settled":
      return "settled";
    default:
      return "pending";
  }
}

function mapRiskLevel(score: number | null): string {
  if (!score) return "low";
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

/**
 * Transform authorization holds table
 */
function transformAuthorizationHolds(): void {
  console.log("Transforming authorization holds...");

  const supabaseHolds = readExport<any>("authorization_holds");
  const convexHolds: any[] = [];

  supabaseHolds.forEach((hold, index) => {
    convexHolds.push({
      _placeholder_id: generatePlaceholderId("holds", index),
      _supabase_id: hold.hold_id,
      cardId: null, // Will be resolved during import
      authorizationId:
        idMaps.authorizations.get(hold.authorization_id) || null,
      cardContext: hold.card_context,

      // Hold details
      holdAmount: Math.round((parseFloat(hold.hold_amount) || 0) * 100),
      authorizationCode: hold.authorization_code || "",

      // Merchant
      merchantName: hold.merchant_name || "Unknown",
      merchantMcc: hold.merchant_category_code || "0000",

      // Status
      status: mapHoldStatus(hold.status),

      // Timestamps
      createdAt: toUnixMs(hold.created_at),
      expiresAt: toUnixMs(hold.expires_at),
      clearedAt: hold.cleared_at ? toUnixMs(hold.cleared_at) : null,
    });
  });

  writeOutput("authorizationHolds", convexHolds);
}

function mapHoldStatus(status: string | null): string {
  switch (status) {
    case "active":
      return "active";
    case "cleared":
      return "cleared";
    case "expired":
      return "expired";
    case "reversed":
      return "reversed";
    default:
      return "active";
  }
}

/**
 * Transform fraud events table
 */
function transformFraud(): void {
  console.log("Transforming fraud events...");

  const supabaseFraud = readExport<any>("fraud_events");
  const fraudLogs = readExport<any>("fraud_detection_logs");
  const convexFraud: any[] = [];

  // Combine fraud events and detection logs
  supabaseFraud.forEach((event, index) => {
    // Find matching detection log
    const log = fraudLogs.find(
      (l: any) => l.authorization_id === event.authorization_id
    );

    convexFraud.push({
      _placeholder_id: generatePlaceholderId("fraud", index),
      _supabase_id: event.event_id,
      cardId: null, // Will be resolved during import
      cardContext: event.card_context_hash,
      authorizationId: null,

      // Transaction reference
      marqetaTransactionToken: null,

      // Risk analysis
      riskScore: event.risk_score || 0,
      riskLevel: event.risk_level || "low",

      // Risk factors
      riskFactors: {
        velocityScore: log?.velocity_score || 0,
        amountScore: log?.amount_score || 0,
        locationScore: log?.location_score || 0,
        timeScore: log?.time_score || 0,
        merchantScore: log?.merchant_score || 0,
      },

      // Anomalies
      anomalies: parseAnomalies(event.anomalies, event.event_type),

      // Decision
      action: mapFraudAction(event.action_taken),

      // User feedback
      userFeedback: event.false_positive === true ? "false_positive" : null,
      feedbackAt: null,

      // Merchant info
      merchantName: null,
      merchantMcc: null,
      merchantCountry: null,

      // Amount
      amount: 0,

      // Timestamps
      analyzedAt: toUnixMs(event.detected_at),
      dismissedAt: event.resolved_at ? toUnixMs(event.resolved_at) : null,
    });
  });

  writeOutput("fraud", convexFraud);
}

function parseAnomalies(anomalies: any, eventType: string): any[] {
  if (Array.isArray(anomalies)) {
    return anomalies.map((a: any) => ({
      type: a.type || "pattern",
      severity: a.severity || "low",
      details: a.details || "",
      confidence: a.confidence || 0.5,
    }));
  }

  // Create anomaly from event type
  return [
    {
      type: mapEventTypeToAnomalyType(eventType),
      severity: "medium",
      details: eventType,
      confidence: 0.7,
    },
  ];
}

function mapEventTypeToAnomalyType(eventType: string): string {
  if (eventType.includes("velocity")) return "velocity";
  if (eventType.includes("amount")) return "amount";
  if (eventType.includes("geographic")) return "geographic";
  if (eventType.includes("merchant")) return "merchant";
  return "pattern";
}

function mapFraudAction(action: string | null): string {
  switch (action) {
    case "approve":
    case "none":
      return "approve";
    case "decline":
      return "decline";
    case "alert":
      return "alert";
    case "freeze":
      return "freeze";
    default:
      return "approve";
  }
}

/**
 * Transform DeFi positions table
 */
function transformDefi(): void {
  console.log("Transforming DeFi positions...");

  const supabaseDefi = readExport<any>("defi_positions");
  const convexDefi: any[] = [];

  supabaseDefi.forEach((position, index) => {
    const placeholderId = generatePlaceholderId("defi", index);
    idMaps.defi.set(position.position_id, placeholderId);

    convexDefi.push({
      _placeholder_id: placeholderId,
      _supabase_id: position.position_id,
      userId: null, // Will be resolved via user_context_hash
      walletId: null, // Will be resolved during import

      // Position identification
      positionId: position.position_id,
      protocolName: position.protocol_name,
      protocolVersion: null,
      networkType: position.network_type || "ethereum",

      // Position type
      positionType: mapPositionType(position.position_type),

      // Assets
      depositedAssets: parseAssets(position.underlying_assets),

      // Value tracking (convert to cents)
      totalValueUsd: Math.round(
        (parseFloat(position.total_value_locked) || 0) * 100
      ),
      depositedValueUsd: Math.round(
        (parseFloat(position.total_value_locked) || 0) * 100
      ),
      earnedValueUsd: 0,
      availableForFunding: Math.round(
        (parseFloat(position.available_for_funding) || 0) * 100
      ),

      // Yield metrics (convert APY to basis points)
      currentYieldApy: Math.round(
        (parseFloat(position.current_yield) || 0) * 10000
      ),
      estimatedDailyYield: 0,

      // Risk
      riskLevel: position.risk_level || "medium",
      healthFactor: null,

      // Sync status
      syncStatus: "synced",
      syncError: null,
      lastSyncedAt: toUnixMs(position.last_updated),

      // Timestamps
      createdAt: toUnixMs(position.created_at),
      closedAt: null,
    });
  });

  writeOutput("defi", convexDefi);
}

function mapPositionType(type: string | null): string {
  switch (type) {
    case "lending":
      return "lending";
    case "borrowing":
      return "borrowing";
    case "liquidity_pool":
      return "liquidity_pool";
    case "staking":
      return "staking";
    case "yield_farming":
      return "yield_farming";
    default:
      return "lending";
  }
}

function parseAssets(assets: any): any[] {
  if (Array.isArray(assets)) {
    return assets.map((a: any) => ({
      symbol: a.symbol || "UNKNOWN",
      amount: parseFloat(a.amount) || 0,
      decimals: a.decimals || 18,
    }));
  }
  return [];
}

/**
 * Transform compliance/KYC records
 */
function transformCompliance(): void {
  console.log("Transforming compliance records...");

  const kycRecords = readExport<any>("kyc_records");
  const convexCompliance: any[] = [];

  kycRecords.forEach((record, index) => {
    convexCompliance.push({
      _placeholder_id: generatePlaceholderId("compliance", index),
      _supabase_id: record.record_id,
      userId: null, // Will be resolved via user_context_hash

      // Document details
      documentType: mapDocumentType(record.kyc_level),
      documentHash: record.user_context_hash,
      storageRef: null,

      // Verification
      verificationProvider: record.verification_method || "manual",
      verificationId: record.record_id,

      // Status
      status: mapComplianceStatus(record.verification_status),
      rejectionReason: null,

      // Extracted data
      extractedData: null,

      // Timestamps
      submittedAt: toUnixMs(record.created_at),
      verifiedAt:
        record.verification_status === "verified"
          ? toUnixMs(record.updated_at)
          : null,
      expiresAt: toUnixMs(record.retention_until),
    });
  });

  writeOutput("compliance", convexCompliance);
}

function mapDocumentType(kycLevel: string): string {
  switch (kycLevel) {
    case "basic":
      return "id_front";
    case "enhanced":
      return "passport";
    case "full":
      return "proof_of_address";
    default:
      return "id_front";
  }
}

function mapComplianceStatus(status: string | null): string {
  switch (status) {
    case "verified":
      return "verified";
    case "pending":
      return "pending";
    case "rejected":
      return "rejected";
    case "expired":
      return "expired";
    default:
      return "pending";
  }
}

/**
 * Transform funding transactions
 */
function transformFundingTransactions(): void {
  console.log("Transforming funding transactions...");

  const fundingTxns = readExport<any>("funding_transactions");
  const cryptoTxns = readExport<any>("crypto_transactions");
  const convexFunding: any[] = [];

  // Process funding transactions
  fundingTxns.forEach((txn, index) => {
    convexFunding.push({
      _placeholder_id: generatePlaceholderId("funding", index),
      _supabase_id: txn.id || txn.transaction_id,
      userId: idMaps.users.get(txn.user_id) || null,

      // Transaction type
      transactionType: mapFundingType(txn.type),

      // Amount
      amount: txn.amount || 0,
      currency: "USD",
      convertedAmount: null,
      conversionRate: null,
      fee: null,

      // Source
      sourceType: mapSourceType(txn.type),
      sourceId: txn.source_card_id || null,
      sourceCardId: null,
      sourceWalletId: null,
      sourceDefiId: null,

      // Target
      targetCardId: null,
      targetWalletId: null,

      // Status
      status: mapFundingStatus(txn.status),

      // External references
      stripePaymentIntentId: txn.stripe_payment_intent_id,
      stripeChargeId: null,
      solanaSignature: null,
      intentId: null,

      // Error handling
      errorMessage: txn.error_message,
      errorCode: txn.error_code,

      // Performance
      processingTimeMs: txn.processing_time
        ? txn.processing_time * 1000
        : null,

      // Timestamps
      createdAt: toUnixMs(txn.created_at),
      completedAt: txn.completed_at ? toUnixMs(txn.completed_at) : null,
    });
  });

  // Process crypto transactions
  cryptoTxns.forEach((txn, index) => {
    convexFunding.push({
      _placeholder_id: generatePlaceholderId(
        "funding",
        fundingTxns.length + index
      ),
      _supabase_id: txn.id || txn.transaction_id,
      userId: idMaps.users.get(txn.user_id) || null,

      // Transaction type
      transactionType: "crypto_conversion",

      // Amount
      amount: txn.usd_amount || 0,
      currency: txn.crypto_type || "ETH",
      convertedAmount: txn.usd_amount,
      conversionRate: txn.conversion_rate
        ? parseFloat(txn.conversion_rate)
        : null,
      fee: txn.network_fee || null,

      // Source
      sourceType: "wallet",
      sourceId: txn.wallet_id,
      sourceCardId: null,
      sourceWalletId: null,
      sourceDefiId: null,

      // Target
      targetCardId: null,
      targetWalletId: null,

      // Status
      status: mapFundingStatus(txn.status),

      // External references
      stripePaymentIntentId: null,
      stripeChargeId: null,
      solanaSignature: txn.blockchain_tx_hash,
      intentId: null,

      // Error handling
      errorMessage: txn.error_message,
      errorCode: txn.error_code,

      // Performance
      processingTimeMs: null,

      // Timestamps
      createdAt: toUnixMs(txn.created_at),
      completedAt:
        txn.status === "completed" ? toUnixMs(txn.updated_at) : null,
    });
  });

  writeOutput("fundingTransactions", convexFunding);
}

function mapFundingType(type: string | null): string {
  switch (type) {
    case "account_funding":
      return "account_funding";
    case "card_allocation":
      return "card_allocation";
    case "card_transfer":
      return "card_transfer";
    case "withdrawal":
      return "card_withdrawal";
    default:
      return "account_funding";
  }
}

function mapSourceType(type: string | null): string {
  switch (type) {
    case "account_funding":
      return "stripe";
    case "card_allocation":
    case "card_transfer":
      return "card";
    default:
      return "external";
  }
}

function mapFundingStatus(status: string | null): string {
  switch (status) {
    case "completed":
    case "confirmed":
      return "completed";
    case "pending":
      return "pending";
    case "processing":
      return "processing";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

/**
 * Transform crypto rates
 */
function transformCryptoRates(): void {
  console.log("Transforming crypto rates...");

  const rates = readExport<any>("crypto_rates");
  const convexRates: any[] = [];

  rates.forEach((rate, index) => {
    convexRates.push({
      _placeholder_id: generatePlaceholderId("rates", index),
      _supabase_id: rate.rate_id,

      symbol: rate.symbol,
      name: getTokenName(rate.symbol),
      usdPrice: parseFloat(rate.usd_price) || 0,
      change24h: parseFloat(rate.change_24h) || 0,
      volume24h: parseFloat(rate.volume_24h) || 0,
      marketCap: 0,
      source: rate.source || "migration",
      createdAt: toUnixMs(rate.created_at),
      updatedAt: toUnixMs(rate.updated_at || rate.timestamp),
    });
  });

  writeOutput("cryptoRates", convexRates);
}

function getTokenName(symbol: string): string {
  const names: Record<string, string> = {
    BTC: "Bitcoin",
    ETH: "Ethereum",
    USDT: "Tether",
    USDC: "USD Coin",
    SOL: "Solana",
    XRP: "Ripple",
    MATIC: "Polygon",
    ARB: "Arbitrum",
    OP: "Optimism",
    AVAX: "Avalanche",
  };
  return names[symbol] || symbol;
}

/**
 * Write ID mapping file for import resolution
 */
function writeIdMaps(): void {
  const maps = {
    users: Object.fromEntries(idMaps.users),
    cards: Object.fromEntries(idMaps.cards),
    wallets: Object.fromEntries(idMaps.wallets),
    authorizations: Object.fromEntries(idMaps.authorizations),
    defi: Object.fromEntries(idMaps.defi),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_id_maps.json"),
    JSON.stringify(maps, null, 2)
  );
  console.log("\n  ID mappings written to _id_maps.json");
}

/**
 * Main transform function
 */
async function main(): Promise<void> {
  console.log("=== Data Transformation ===\n");
  console.log(`Input: ${INPUT_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  // Validate input directory
  if (!fs.existsSync(INPUT_DIR)) {
    console.error(
      "Error: Export directory not found. Run export-supabase.ts first."
    );
    process.exit(1);
  }

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Transform in order (users first for ID mapping)
  transformUsers();
  transformCards();
  transformWallets();
  transformAuthorizations();
  transformAuthorizationHolds();
  transformFraud();
  transformDefi();
  transformCompliance();
  transformFundingTransactions();
  transformCryptoRates();

  // Write ID mappings
  writeIdMaps();

  console.log("\n=== Transform Complete ===");
  console.log("\nNext step: npx convex run migrations/importData:importAll");
}

// Run transform
main().catch(console.error);
