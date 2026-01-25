/**
 * DisCard 2035 - Convex Schema (Lean Muscle Schema)
 *
 * This schema replaces the previous 38-table Supabase SQL setup with a streamlined
 * 10-table design optimized for the Intent-Centric AI Middleware architecture.
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============ USERS ============
  // Passkey-based identity (replaces email/password + JWT)
  users: defineTable({
    // Passkey authentication
    credentialId: v.string(),           // WebAuthn credential ID
    publicKey: v.bytes(),               // P-256 public key for Solana signing
    solanaAddress: v.optional(v.string()), // Derived Solana wallet address
    ethereumAddress: v.optional(v.string()), // Derived Ethereum wallet address (for MoonPay ETH purchases)

    // Profile
    displayName: v.optional(v.string()),
    phoneHash: v.optional(v.string()),  // For TextPay PDA derivation
    phoneNumber: v.optional(v.string()), // E.164 format for P2P discovery
    email: v.optional(v.string()),      // Optional, for notifications only

    // Privacy settings
    privacySettings: v.object({
      dataRetention: v.number(),        // Days to retain data
      analyticsOptOut: v.boolean(),
      transactionIsolation: v.boolean(), // Enable card context isolation
      // Privacy level tier (determines default behaviors)
      privacyLevel: v.optional(v.union(
        v.literal("basic"),             // Standard privacy, fastest UX
        v.literal("enhanced"),          // Stealth addresses, MPC swaps
        v.literal("maximum")            // Full ZK, Tor routing, max isolation
      )),
      // Provider preferences (auto-set by privacy level, can be overridden)
      preferredSwapProvider: v.optional(v.union(
        v.literal("jupiter"),           // Standard swaps (basic)
        v.literal("anoncoin"),          // MPC confidential (enhanced)
        v.literal("silentswap")         // Shielded pools (maximum)
      )),
      preferredFundingMethod: v.optional(v.union(
        v.literal("direct"),            // Direct wallet funding (basic)
        v.literal("stealth"),           // Stealth address funding (enhanced)
        v.literal("shielded")           // Shielded pool funding (maximum)
      )),
      useStealthAddresses: v.optional(v.boolean()),    // Hush Protocol stealth addresses
      useMpcSwaps: v.optional(v.boolean()),            // Arcium MPC for swaps
      useZkProofs: v.optional(v.boolean()),            // ZK proofs for card funding
      useRingSignatures: v.optional(v.boolean()),      // Ring signatures for transfers
      torRoutingEnabled: v.optional(v.boolean()),      // Server-side Tor for RPC calls
      // Differential privacy settings for analytics protection
      dpEnabled: v.optional(v.boolean()),              // Enable DP for fraud/analytics queries
      dpEpsilon: v.optional(v.number()),               // Privacy budget (default: 1.0, lower = more private)
      dpDelta: v.optional(v.number()),                 // Failure probability (default: 1e-5)
    }),

    // Account status
    kycStatus: v.union(
      v.literal("none"),
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected")
    ),
    riskScore: v.number(),              // 0-100, updated by fraud detection
    accountStatus: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("locked")
    ),

    // Timestamps
    lastActive: v.number(),
    createdAt: v.number(),
  })
    .index("by_credential", ["credentialId"])
    .index("by_phone_hash", ["phoneHash"])
    .index("by_phone_number", ["phoneNumber"])
    .index("by_solana_address", ["solanaAddress"])
    .index("by_ethereum_address", ["ethereumAddress"])
    .index("by_email", ["email"]),

  // ============ INTENTS ============
  // Command Bar entries - natural language to transaction instructions
  intents: defineTable({
    userId: v.id("users"),

    // Raw input from Command Bar
    rawText: v.string(),                // "Pay this bill with my ETH yield"
    rawInput: v.optional(v.string()),   // Alias for rawText (for API compatibility)

    // AI processing results
    claudeSessionId: v.optional(v.string()),
    parsedIntent: v.optional(v.object({
      action: v.union(
        v.literal("fund_card"),
        v.literal("swap"),
        v.literal("transfer"),
        v.literal("withdraw_defi"),
        v.literal("create_card"),
        v.literal("freeze_card"),
        v.literal("delete_card"),       // Delete/terminate a card
        v.literal("pay_bill"),
        v.literal("merchant_payment"),  // Cross-currency payment to merchant
        v.literal("create_goal"),       // Create a savings/accumulation goal
        v.literal("update_goal"),       // Update goal progress
        v.literal("cancel_goal")        // Cancel a goal
      ),
      sourceType: v.union(
        v.literal("wallet"),
        v.literal("defi_position"),
        v.literal("card"),
        v.literal("external")
      ),
      sourceId: v.optional(v.string()),
      targetType: v.union(
        v.literal("card"),
        v.literal("wallet"),
        v.literal("external")
      ),
      targetId: v.optional(v.string()),
      amount: v.optional(v.number()),   // In cents or smallest unit
      currency: v.optional(v.string()), // USD, ETH, SOL, etc.
      metadata: v.optional(v.any()),    // Additional context
    })),

    // Clarification flow
    clarificationQuestion: v.optional(v.string()),
    clarificationResponse: v.optional(v.string()),

    // AI response text for conversational display
    responseText: v.optional(v.string()),

    // Execution state
    status: v.union(
      v.literal("pending"),             // Just created
      v.literal("parsing"),             // Claude is analyzing
      v.literal("clarifying"),          // Awaiting user clarification
      v.literal("ready"),               // Parsed, awaiting approval
      v.literal("approved"),            // User approved, ready to execute
      v.literal("executing"),           // Transaction in progress
      v.literal("completed"),           // Success
      v.literal("failed"),              // Error occurred
      v.literal("cancelled")            // User cancelled
    ),

    // Solana transaction details
    solanaTransactionSignature: v.optional(v.string()),
    solanaInstructions: v.optional(v.array(v.any())), // Serialized instructions

    // Error handling
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),

    // Audit trail
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    parsedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  // ============ INTENT CACHE ============
  // Cache for parsed intents and responses to reduce LLM calls
  intentCache: defineTable({
    inputHash: v.string(),           // Hash of normalized input text
    inputText: v.string(),           // Original input text
    responseType: v.string(),        // "question" | "conversation" | "action"
    response: v.any(),               // Cached response object
    hitCount: v.number(),            // Usage tracking for eviction
    createdAt: v.number(),
    expiresAt: v.number(),           // TTL-based expiration
  }).index("by_hash", ["inputHash"]),

  // ============ USER TOKEN USAGE ============
  // Daily token usage tracking for rate limiting
  userTokenUsage: defineTable({
    userId: v.id("users"),
    date: v.string(),                // YYYY-MM-DD format
    inputTokens: v.number(),         // Total input tokens used
    outputTokens: v.number(),        // Total output tokens used
    requestCount: v.number(),        // Total requests made
    cacheHits: v.number(),           // Requests served from cache
    llmCalls: v.number(),            // Actual LLM API calls made
  }).index("by_user_date", ["userId", "date"]),

  // ============ INTENT QUEUE ============
  // Queue for rate-limited requests
  intentQueue: defineTable({
    userId: v.id("users"),
    rawText: v.string(),             // User's input text
    queuedAt: v.number(),            // When request was queued
    estimatedWaitMs: v.number(),     // Estimated wait time
    position: v.number(),            // Position in queue
    status: v.string(),              // "queued" | "processing" | "completed" | "expired"
    expiresAt: v.number(),           // When queued request expires
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_expires", ["expiresAt"]),

  // ============ CARDS ============
  // Virtual disposable cards with privacy isolation
  cards: defineTable({
    userId: v.id("users"),

    // Card provider (supports multi-provider architecture)
    provider: v.optional(v.union(
      v.literal("marqeta"),           // KYC + JIT funding (primary)
      v.literal("starpay")            // No-KYC + prepaid (alternative)
    )),

    // Card identity and privacy isolation
    cardContext: v.string(),            // SHA-256 hash for transaction isolation
    marqetaCardToken: v.optional(v.string()), // Marqeta card reference (legacy)
    marqetaUserToken: v.optional(v.string()), // Marqeta user reference (legacy)
    providerCardToken: v.optional(v.string()), // Generic provider card token
    providerUserToken: v.optional(v.string()), // Generic provider user token

    // Card details (PAN/CVV stored only in Marqeta)
    last4: v.string(),
    expirationMonth: v.number(),
    expirationYear: v.number(),
    cardType: v.union(
      v.literal("virtual"),
      v.literal("physical")
    ),

    // Limits and balances
    spendingLimit: v.number(),          // Max per transaction (cents)
    dailyLimit: v.number(),             // Max per day (cents)
    monthlyLimit: v.number(),           // Max per month (cents)
    currentBalance: v.number(),         // Available balance (cents)
    reservedBalance: v.number(),        // Held for pending auths (cents)
    overdraftLimit: v.number(),         // Overdraft allowance (cents)

    // Card status
    status: v.union(
      v.literal("pending"),             // Awaiting Marqeta provisioning
      v.literal("active"),              // Ready for use
      v.literal("paused"),              // User paused
      v.literal("frozen"),              // Security hold
      v.literal("reissuing"),           // Self-healing in progress
      v.literal("terminated"),          // Permanently cancelled
      v.literal("deleted")              // Soft deleted
    ),

    // Merchant restrictions (MCC codes)
    allowedMccCodes: v.optional(v.array(v.string())),
    blockedMccCodes: v.optional(v.array(v.string())),
    blockedCountries: v.optional(v.array(v.string())),

    // Self-healing cards feature
    breachDetectedAt: v.optional(v.number()),
    breachSource: v.optional(v.string()),
    reissuedFrom: v.optional(v.id("cards")),
    reissuedTo: v.optional(v.id("cards")),

    // Privacy isolation flag
    privacyIsolated: v.boolean(),

    // Prepaid card fields (Starpay)
    starpayCardType: v.optional(v.union(
      v.literal("black"),             // One-time use, no top-ups
      v.literal("platinum")           // Reloadable, requires $STARPAY tokens
    )),
    prepaidBalance: v.optional(v.number()),      // Current prepaid balance (cents)
    balanceCommitment: v.optional(v.string()),   // SHA-256 commitment for privacy
    balanceRandomness: v.optional(v.string()),   // Randomness for commitment (encrypted)
    lastTopUpAt: v.optional(v.number()),         // Last top-up timestamp
    maxSingleTopUp: v.optional(v.number()),      // Max per top-up (cents)
    dailyTopUpLimit: v.optional(v.number()),     // Daily top-up limit (cents)
    totalTopUpToday: v.optional(v.number()),     // Today's total top-ups (cents)
    topUpResetAt: v.optional(v.number()),        // When daily counter resets

    // Metadata
    nickname: v.optional(v.string()),
    color: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_card_context", ["cardContext"])
    .index("by_marqeta_token", ["marqetaCardToken"])
    .index("by_provider_token", ["providerCardToken"])
    .index("by_provider", ["provider"])
    .index("by_status", ["status"]),

  // ============ CARD FUNDING REQUESTS ============
  // Privacy-preserving funding requests for prepaid cards
  cardFundingRequests: defineTable({
    userId: v.id("users"),
    cardId: v.id("cards"),

    // Funding details
    amount: v.number(),              // Requested amount (cents)
    fee: v.number(),                 // Provider fee (cents)
    netAmount: v.number(),           // Net amount after fee (cents)

    // Single-use address for privacy
    depositAddress: v.string(),      // Turnkey-generated single-use address
    sessionKeyId: v.string(),        // Restricted session key ID
    subOrgId: v.string(),            // Turnkey sub-org ID

    // Status tracking
    status: v.union(
      v.literal("pending"),          // Awaiting deposit
      v.literal("funded"),           // Deposit received
      v.literal("processing"),       // Funding card via provider
      v.literal("completed"),        // Card funded successfully
      v.literal("expired"),          // Address expired (30 min)
      v.literal("failed")            // Error occurred
    ),

    // Transaction tracking
    depositTxSignature: v.optional(v.string()),  // Solana tx signature
    fundingTransactionId: v.optional(v.string()), // Provider transaction ID
    errorMessage: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    expiresAt: v.number(),           // When single-use address expires
    fundedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_card", ["cardId"])
    .index("by_address", ["depositAddress"])
    .index("by_status", ["status"])
    .index("by_expires", ["expiresAt"]),

  // ============ WALLETS ============
  // Connected external wallets (crypto)
  wallets: defineTable({
    userId: v.id("users"),

    // Wallet identification
    walletType: v.union(
      v.literal("passkey"),             // Hardware-bound Solana wallet (primary)
      v.literal("walletconnect"),       // WalletConnect session
      v.literal("solana_external"),     // External Solana wallet
      v.literal("eth_external"),        // External Ethereum wallet
      v.literal("bitcoin")              // Bitcoin wallet (read-only)
    ),

    // Address (encrypted for external wallets)
    address: v.string(),                // Public address
    encryptedPrivateData: v.optional(v.string()), // Encrypted session data
    addressLastFour: v.string(),        // Display purposes

    // Network configuration
    networkType: v.string(),            // "solana", "ethereum", "polygon", "bitcoin"
    chainId: v.optional(v.number()),    // EVM chain ID

    // Balance tracking
    cachedBalance: v.optional(v.number()), // In smallest unit (lamports, wei, satoshi)
    cachedBalanceUsd: v.optional(v.number()), // USD equivalent (cents)
    balanceLastUpdated: v.optional(v.number()),

    // Connection state
    connectionStatus: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("expired"),
      v.literal("error")
    ),
    sessionExpiry: v.optional(v.number()),

    // WalletConnect specific
    wcTopic: v.optional(v.string()),
    wcPeerMetadata: v.optional(v.object({
      name: v.string(),
      url: v.string(),
      icons: v.array(v.string()),
    })),

    // Permissions granted
    permissions: v.array(v.string()),   // ["sign_transaction", "sign_message"]

    // User preferences
    isDefault: v.boolean(),             // Default funding source
    nickname: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_network", ["userId", "networkType"])
    .index("by_user_default", ["userId", "isDefault"])
    .index("by_wc_topic", ["wcTopic"])
    .index("by_address", ["address"]),

  // ============ AUTHORIZATIONS ============
  // Payment authorization transactions from Marqeta
  authorizations: defineTable({
    cardId: v.id("cards"),
    cardContext: v.string(),            // For privacy isolation queries

    // Marqeta reference
    marqetaTransactionToken: v.string(),
    authorizationCode: v.optional(v.string()),

    // Transaction details
    amount: v.number(),                 // Original amount (cents)
    currencyCode: v.string(),           // Original currency
    convertedAmount: v.optional(v.number()), // USD amount if converted
    exchangeRate: v.optional(v.number()),

    // Merchant information
    merchantName: v.string(),
    merchantMcc: v.string(),            // Merchant Category Code
    merchantCountry: v.optional(v.string()),
    merchantCity: v.optional(v.string()),
    merchantId: v.optional(v.string()),

    // Authorization status
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined"),
      v.literal("expired"),
      v.literal("reversed"),
      v.literal("settled")
    ),
    declineReason: v.optional(v.string()),
    declineCode: v.optional(v.string()),

    // Performance metrics
    responseTimeMs: v.number(),         // For sub-800ms monitoring

    // Risk assessment
    riskScore: v.number(),              // 0-100 from fraud detection
    riskLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),

    // Retry tracking
    retryCount: v.number(),

    // Timestamps
    processedAt: v.number(),
    expiresAt: v.number(),
    settledAt: v.optional(v.number()),
  })
    .index("by_card", ["cardId"])
    .index("by_card_context", ["cardContext"])
    .index("by_marqeta_token", ["marqetaTransactionToken"])
    .index("by_status", ["status"])
    .index("by_processed", ["processedAt"]),

  // ============ AUTHORIZATION HOLDS ============
  // Reserved funds for pending authorizations
  authorizationHolds: defineTable({
    cardId: v.id("cards"),
    authorizationId: v.id("authorizations"),
    cardContext: v.string(),

    // Hold details
    holdAmount: v.number(),             // Amount reserved (cents)
    authorizationCode: v.string(),

    // Merchant reference
    merchantName: v.string(),
    merchantMcc: v.string(),

    // Hold status
    status: v.union(
      v.literal("active"),
      v.literal("cleared"),             // Settled
      v.literal("expired"),             // Timed out
      v.literal("reversed")             // Refunded
    ),

    // Timestamps
    createdAt: v.number(),
    expiresAt: v.number(),
    clearedAt: v.optional(v.number()),
  })
    .index("by_card", ["cardId"])
    .index("by_authorization", ["authorizationId"])
    .index("by_card_context", ["cardContext"])
    .index("by_status", ["status"])
    .index("by_expires", ["expiresAt"]),

  // ============ FRAUD ============
  // Fraud analysis results and alerts
  fraud: defineTable({
    cardId: v.id("cards"),
    cardContext: v.string(),
    authorizationId: v.optional(v.id("authorizations")),

    // Transaction reference
    marqetaTransactionToken: v.optional(v.string()),

    // Risk analysis results
    riskScore: v.number(),              // 0-100
    riskLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),

    // Individual risk factors
    riskFactors: v.object({
      velocityScore: v.number(),        // Transaction frequency
      amountScore: v.number(),          // Amount deviation
      locationScore: v.number(),        // Geographic anomaly
      timeScore: v.number(),            // Unusual hours
      merchantScore: v.number(),        // High-risk merchant
    }),

    // Anomalies detected
    anomalies: v.array(v.object({
      type: v.union(
        v.literal("velocity"),
        v.literal("amount"),
        v.literal("geographic"),
        v.literal("merchant"),
        v.literal("pattern")
      ),
      severity: v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high")
      ),
      details: v.string(),
      confidence: v.number(),           // 0-1
    })),

    // Decision and action
    action: v.union(
      v.literal("approve"),
      v.literal("decline"),
      v.literal("alert"),
      v.literal("freeze"),
      v.literal("step_up_auth")
    ),

    // User feedback
    userFeedback: v.optional(v.union(
      v.literal("confirmed_fraud"),
      v.literal("false_positive"),
      v.literal("pending")
    )),
    feedbackAt: v.optional(v.number()),

    // Merchant info
    merchantName: v.optional(v.string()),
    merchantMcc: v.optional(v.string()),
    merchantCountry: v.optional(v.string()),

    // Transaction amount
    amount: v.number(),

    // Timestamps
    analyzedAt: v.number(),
    dismissedAt: v.optional(v.number()),
  })
    .index("by_card", ["cardId"])
    .index("by_card_context", ["cardContext"])
    .index("by_authorization", ["authorizationId"])
    .index("by_analyzed", ["analyzedAt"])
    .index("by_risk_level", ["riskLevel"]),

  // ============ DEFI ============
  // DeFi positions for yield-based funding
  defi: defineTable({
    userId: v.id("users"),
    walletId: v.id("wallets"),

    // Position identification
    positionId: v.string(),             // External protocol reference
    protocolName: v.string(),           // "Aave", "Compound", "Uniswap", etc.
    protocolVersion: v.optional(v.string()), // "v3", "v2"
    networkType: v.string(),            // "ethereum", "polygon", "solana"

    // Position type
    positionType: v.union(
      v.literal("lending"),             // Aave, Compound supply
      v.literal("borrowing"),           // Aave, Compound borrow
      v.literal("liquidity_pool"),      // Uniswap, Raydium LP
      v.literal("staking"),             // Validator staking
      v.literal("yield_farming")        // Farm rewards
    ),

    // Assets
    depositedAssets: v.array(v.object({
      symbol: v.string(),
      amount: v.number(),
      decimals: v.number(),
    })),

    // Value tracking
    totalValueUsd: v.number(),          // Current value (cents)
    depositedValueUsd: v.number(),      // Original deposit (cents)
    earnedValueUsd: v.number(),         // Yield earned (cents)
    availableForFunding: v.number(),    // Can be used to fund cards (cents)

    // Yield metrics
    currentYieldApy: v.number(),        // Annual percentage yield (basis points)
    estimatedDailyYield: v.number(),    // Daily yield (cents)

    // Risk assessment
    riskLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
    healthFactor: v.optional(v.number()), // For lending positions

    // Sync status
    syncStatus: v.union(
      v.literal("synced"),
      v.literal("syncing"),
      v.literal("error")
    ),
    syncError: v.optional(v.string()),
    lastSyncedAt: v.number(),

    // Timestamps
    createdAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_wallet", ["walletId"])
    .index("by_protocol", ["protocolName"])
    .index("by_user_protocol", ["userId", "protocolName"]),

  // ============ COMPLIANCE ============
  // KYC documents and verification status
  compliance: defineTable({
    userId: v.id("users"),

    // Document details
    documentType: v.union(
      v.literal("id_front"),
      v.literal("id_back"),
      v.literal("passport"),
      v.literal("selfie"),
      v.literal("proof_of_address"),
      v.literal("bank_statement")
    ),
    documentHash: v.string(),           // Hash for deduplication
    storageRef: v.optional(v.string()), // Secure storage reference

    // Verification
    verificationProvider: v.string(),   // "persona", "jumio", "manual"
    verificationId: v.string(),         // External verification ID

    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("verified"),
      v.literal("rejected"),
      v.literal("expired")
    ),
    rejectionReason: v.optional(v.string()),

    // Extracted data (for verified documents)
    extractedData: v.optional(v.object({
      fullName: v.optional(v.string()),
      dateOfBirth: v.optional(v.string()),
      address: v.optional(v.string()),
      documentNumber: v.optional(v.string()),
      expirationDate: v.optional(v.string()),
    })),

    // Timestamps
    submittedAt: v.number(),
    verifiedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "documentType"])
    .index("by_status", ["status"])
    .index("by_verification_id", ["verificationId"]),

  // ============ FUNDING TRANSACTIONS ============
  // Money movement records
  fundingTransactions: defineTable({
    userId: v.id("users"),

    // Transaction type
    transactionType: v.union(
      v.literal("account_funding"),     // External money in (Stripe)
      v.literal("card_allocation"),     // Account to card
      v.literal("card_transfer"),       // Card to card
      v.literal("card_withdrawal"),     // Card to account
      v.literal("defi_withdrawal"),     // DeFi position to account
      v.literal("crypto_conversion"),   // Crypto to USD
      v.literal("refund")               // Money returned
    ),

    // Amount
    amount: v.number(),                 // In cents
    currency: v.string(),               // Source currency
    convertedAmount: v.optional(v.number()), // If conversion occurred
    conversionRate: v.optional(v.number()),
    fee: v.optional(v.number()),        // Transaction fee (cents)

    // Source details
    sourceType: v.optional(v.union(
      v.literal("stripe"),
      v.literal("card"),
      v.literal("wallet"),
      v.literal("defi"),
      v.literal("external"),
      v.literal("moonpay"),
      v.literal("iban")
    )),
    sourceId: v.optional(v.string()),
    sourceCardId: v.optional(v.id("cards")),
    sourceWalletId: v.optional(v.id("wallets")),
    sourceDefiId: v.optional(v.id("defi")),

    // Target details
    targetCardId: v.optional(v.id("cards")),
    targetWalletId: v.optional(v.id("wallets")),

    // Status tracking
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("refunded")
    ),

    // External references
    stripePaymentIntentId: v.optional(v.string()),
    stripeChargeId: v.optional(v.string()),
    solanaSignature: v.optional(v.string()),
    intentId: v.optional(v.id("intents")), // If triggered by intent

    // Error handling
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),

    // Performance
    processingTimeMs: v.optional(v.number()),

    // Timestamps
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_type", ["userId", "transactionType"])
    .index("by_source_card", ["sourceCardId"])
    .index("by_target_card", ["targetCardId"])
    .index("by_stripe_intent", ["stripePaymentIntentId"])
    .index("by_intent", ["intentId"])
    .index("by_created", ["createdAt"]),

  // ============ CRYPTO RATES ============
  // Cached cryptocurrency prices for real-time subscriptions
  cryptoRates: defineTable({
    symbol: v.string(),               // "BTC", "ETH", "SOL", etc.
    name: v.string(),                 // "Bitcoin", "Ethereum", etc.
    usdPrice: v.number(),             // Price in USD
    change24h: v.number(),            // 24h price change percentage
    volume24h: v.number(),            // 24h trading volume in USD
    marketCap: v.number(),            // Market capitalization in USD
    source: v.string(),               // Data source ("coingecko", "coinmarketcap")
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_symbol", ["symbol"])
    .index("by_updated", ["updatedAt"]),

  // ============ PRICE HISTORY ============
  // Historical price data for charts
  priceHistory: defineTable({
    entityType: v.union(v.literal("crypto"), v.literal("market")),
    entityId: v.string(),  // Symbol (BTC, ETH) or marketId
    timestamp: v.number(), // Unix timestamp ms
    value: v.number(),     // Price USD or probability 0-1
    volume: v.optional(v.number()),
    granularity: v.union(v.literal("1h"), v.literal("1d")),
    source: v.string(),
  })
    .index("by_entity_time", ["entityType", "entityId", "timestamp"])
    .index("by_entity_granularity", ["entityType", "entityId", "granularity"]),

  // ============ FX RATES ============
  // Fiat currency exchange rates (USD base)
  fxRates: defineTable({
    currency: v.string(),             // "EUR", "GBP", etc.
    rate: v.number(),                 // Rate to USD (e.g., EUR 1.08 = 1 EUR = 1.08 USD)
    source: v.string(),               // Data source ("exchangerate-api", "fixer", "fallback")
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_currency", ["currency"])
    .index("by_updated", ["updatedAt"]),

  // ============ VIRTUAL IBANS ============
  // User-dedicated IBANs for direct bank deposits
  virtualIbans: defineTable({
    userId: v.id("users"),

    // IBAN details (provided by banking partner)
    iban: v.string(),                    // DE89370400440532013000
    bic: v.string(),                     // COBADEFFXXX
    accountHolderName: v.string(),       // "DisCard for [User]"
    bankName: v.string(),                // Partner bank name

    // Provider reference
    provider: v.union(
      v.literal("stripe_treasury"),
      v.literal("railsr"),
      v.literal("wise")
    ),
    externalAccountId: v.string(),       // Provider's account reference

    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("suspended"),
      v.literal("closed")
    ),

    // Limits
    dailyLimit: v.number(),              // Cents
    monthlyLimit: v.number(),

    // Timestamps
    createdAt: v.number(),
    activatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_iban", ["iban"])
    .index("by_external_id", ["externalAccountId"]),

  // ============ MOONPAY TRANSACTIONS ============
  // Crypto on-ramp transactions via MoonPay
  moonpayTransactions: defineTable({
    userId: v.id("users"),
    fundingTransactionId: v.optional(v.id("fundingTransactions")),

    // MoonPay references
    moonpayTransactionId: v.string(),    // MoonPay's transaction ID
    moonpayWidgetId: v.optional(v.string()),

    // Transaction details
    fiatCurrency: v.string(),            // EUR, GBP, USD
    fiatAmount: v.number(),              // Amount in cents
    cryptoCurrency: v.string(),          // ETH, USDC, etc.
    cryptoAmount: v.optional(v.number()), // Crypto received
    usdAmount: v.optional(v.number()),   // Final USD amount (cents)

    // Destination wallet for crypto (PRIVACY FIELDS)
    // walletAddress is DEPRECATED - use walletAddressHash for privacy
    walletAddress: v.optional(v.string()), // Legacy - will be removed
    // Hash of wallet address (privacy-preserving, non-reversible)
    walletAddressHash: v.optional(v.string()),
    // Last 4 chars for customer support display only
    walletAddressPartial: v.optional(v.string()),

    // Fees
    moonpayFee: v.optional(v.number()),
    networkFee: v.optional(v.number()),

    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("waitingPayment"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    failureReason: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_moonpay_id", ["moonpayTransactionId"])
    .index("by_funding_transaction", ["fundingTransactionId"]),

  // ============================================================================
  // 2035 FINANCIAL OS - Solana Native Architecture
  // ============================================================================

  // ============ DID DOCUMENTS (alex.sovereign Standard) ============
  // W3C DID v1.1 with ZK compression via Light Protocol (did:sol:zk method)
  didDocuments: defineTable({
    userId: v.id("users"),

    // DID identifier (did:sol:zk:username or did:sol:zk:<base58-address>)
    did: v.string(),

    // On-chain anchoring (only these go on Solana via Light Protocol)
    documentHash: v.string(),           // SHA-256 of full DID document
    commitmentHash: v.string(),         // Poseidon hash for ZK validity proofs
    merkleRoot: v.optional(v.string()), // Light Protocol state tree root

    // Local storage reference (full document encrypted locally)
    localDocumentEncrypted: v.optional(v.bytes()),

    // ZK proof storage (validity proof stored on IPFS or similar)
    zkProofCid: v.optional(v.string()), // IPFS CID of validity proof

    // Verification methods (public keys)
    verificationMethods: v.array(v.object({
      id: v.string(),                   // "#key-1", "#passkey-recovery"
      type: v.string(),                 // "JsonWebKey2020", "Multikey"
      publicKeyJwk: v.optional(v.object({
        kty: v.string(),                // "EC"
        crv: v.string(),                // "P-256"
        x: v.string(),                  // Base64url X coordinate
        y: v.string(),                  // Base64url Y coordinate
      })),
      publicKeyMultibase: v.optional(v.string()), // Multibase-encoded key
      controller: v.string(),           // DID that controls this key
    })),

    // Authentication methods (references to verificationMethods)
    authentication: v.array(v.string()),

    // Assertion methods (for signing credentials)
    assertionMethod: v.optional(v.array(v.string())),

    // Key agreement methods (for encryption)
    keyAgreement: v.optional(v.array(v.string())),

    // Social recovery configuration
    recoveryThreshold: v.number(),      // 2-of-3, 3-of-5, etc.
    recoveryGuardians: v.array(v.object({
      guardianDid: v.string(),          // Guardian's DID
      attestationHash: v.string(),      // SAS attestation hash
      addedAt: v.number(),
      status: v.union(
        v.literal("active"),
        v.literal("revoked")
      ),
    })),

    // Service endpoints (optional)
    services: v.optional(v.array(v.object({
      id: v.string(),
      type: v.string(),                 // "DisCardMessaging", "DisCardPayments"
      serviceEndpoint: v.string(),      // URL or DID
    }))),

    // DID document status
    status: v.union(
      v.literal("creating"),            // Being provisioned
      v.literal("active"),              // Ready for use
      v.literal("suspended"),           // Temporarily disabled
      v.literal("revoked")              // Permanently disabled
    ),

    // Key rotation tracking
    lastKeyRotationAt: v.optional(v.number()),
    keyRotationCount: v.number(),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_did", ["did"])
    .index("by_commitment", ["commitmentHash"])
    .index("by_status", ["status"]),

  // ============ RECOVERY ATTESTATIONS ============
  // Social recovery proofs for DID key rotation
  recoveryAttestations: defineTable({
    didDocumentId: v.id("didDocuments"),

    // Guardian information
    guardianDid: v.string(),            // Guardian's DID (did:sol:zk:...)
    guardianUserId: v.optional(v.id("users")), // If guardian is a DisCard user

    // Attestation type
    attestationType: v.union(
      v.literal("sas_recovery"),        // Solana Attestation Service
      v.literal("manual_verification"), // Manual identity verification
      v.literal("social_vouching")      // Trust network vouching
    ),

    // ZK proof (Groth16 proof that guardian verified identity)
    zkProof: v.optional(v.bytes()),
    zkProofPublicInputs: v.optional(v.array(v.string())),

    // SAS reference
    sasAttestationId: v.optional(v.string()),
    sasAttestationAddress: v.optional(v.string()), // Solana account

    // Recovery request details
    newKeyCommitment: v.optional(v.string()), // Commitment to new key
    recoveryReason: v.optional(v.string()),

    // Status
    status: v.union(
      v.literal("pending"),             // Awaiting guardian action
      v.literal("approved"),            // Guardian approved
      v.literal("rejected"),            // Guardian rejected
      v.literal("verified"),            // ZK proof verified
      v.literal("expired"),             // Timed out
      v.literal("used")                 // Used for recovery
    ),

    // Timestamps
    requestedAt: v.number(),
    respondedAt: v.optional(v.number()),
    expiresAt: v.number(),
  })
    .index("by_document", ["didDocumentId"])
    .index("by_guardian", ["guardianDid"])
    .index("by_status", ["status"])
    .index("by_expires", ["expiresAt"]),

  // ============ TURNKEY SUB-ORGANIZATIONS ============
  // TEE-protected wallet infrastructure (one sub-org per user)
  turnkeyOrganizations: defineTable({
    userId: v.id("users"),
    didDocumentId: v.optional(v.id("didDocuments")), // Link to DID

    // Turnkey identifiers
    subOrganizationId: v.string(),      // Turnkey sub-org ID
    rootUserId: v.string(),             // User's Turnkey user ID (passkey auth)
    serviceUserId: v.string(),          // DisCard's propose-only service user

    // TEE-generated wallets
    walletId: v.string(),               // Turnkey wallet ID
    walletAddress: v.string(),          // Solana address derived in TEE
    walletPublicKey: v.string(),        // Ed25519 public key (base58)
    ethereumAddress: v.optional(v.string()), // Ethereum address (0x...) for MoonPay

    // Policy configuration (enforced in AWS Nitro Enclave)
    policies: v.object({
      // Merchant controls
      merchantLocking: v.boolean(),     // Enable merchant whitelist
      allowedMerchants: v.optional(v.array(v.string())), // Visa merchant IDs
      allowedMccCodes: v.optional(v.array(v.string())),  // Merchant category codes
      blockedMerchants: v.optional(v.array(v.string())),
      blockedMccCodes: v.optional(v.array(v.string())),

      // Velocity limits (hardware-enforced in TEE)
      velocityLimits: v.object({
        perTransaction: v.number(),     // Max per transaction (cents)
        daily: v.number(),              // Max per day (cents)
        weekly: v.number(),             // Max per week (cents)
        monthly: v.number(),            // Max per month (cents)
      }),

      // Current spending (tracked for velocity enforcement)
      currentSpending: v.object({
        daily: v.number(),
        weekly: v.number(),
        monthly: v.number(),
        lastResetAt: v.number(),
      }),

      // Security requirements
      requireBiometric: v.boolean(),    // Require FaceID/Fingerprint
      requireStep2FA: v.boolean(),      // Require additional 2FA
      require2faAbove: v.optional(v.number()), // Amount threshold for 2FA (cents)
      allowedIpRanges: v.optional(v.array(v.string())), // IP allowlist

      // Fraud integration
      requireFraudClearance: v.boolean(), // Check fraud status before signing
    }),

    // Sub-org status
    status: v.union(
      v.literal("creating"),            // Provisioning in Turnkey
      v.literal("active"),              // Ready for use
      v.literal("suspended"),           // Temporarily disabled
      v.literal("frozen")               // Security freeze
    ),

    // Activity tracking
    lastActivityAt: v.optional(v.number()),
    totalTransactionsCount: v.number(),
    totalTransactionsVolume: v.number(), // Total USD volume (cents)

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_did", ["didDocumentId"])
    .index("by_sub_org", ["subOrganizationId"])
    .index("by_wallet_address", ["walletAddress"])
    .index("by_status", ["status"]),

  // ============ ATTESTATIONS (SAS Integration) ============
  // Solana Attestation Service stamps for identity verification
  attestations: defineTable({
    userId: v.id("users"),
    didDocumentId: v.optional(v.id("didDocuments")), // Optional - not all attestations require DID

    // Attestation type (expanded to support all verification types)
    attestationType: v.union(
      // Age verification
      v.literal("age_over_18"),
      v.literal("age_over_21"),
      // Residency
      v.literal("uk_resident"),
      v.literal("us_resident"),
      v.literal("eu_resident"),
      // KYC levels (legacy naming)
      v.literal("kyc_level_1"),         // Basic identity
      v.literal("kyc_level_2"),         // Enhanced with address
      v.literal("kyc_level_3"),         // Full with source of funds
      // KYC levels (new naming)
      v.literal("kyc_basic"),           // Basic identity check
      v.literal("kyc_enhanced"),        // Enhanced with address proof
      v.literal("kyc_full"),            // Full KYC with source of funds
      // AML/Sanctions
      v.literal("aml_cleared"),         // Anti-money laundering cleared
      v.literal("sanctions_cleared"),   // Not on sanctions lists
      // Identity verification
      v.literal("identity_verified"),   // Identity document verified
      v.literal("biometric_verified"),  // Biometric (face) verified
      v.literal("liveness_verified"),   // Liveness check passed
      v.literal("document_verified"),   // Document authenticity verified
      // Investor status
      v.literal("accredited_investor"),
      v.literal("professional_investor"), // Professional investor status
      // Social recovery
      v.literal("recovery_guardian"),   // Can act as guardian for others
      // Email/Phone/Address verification
      v.literal("email_verified"),      // Email address verified
      v.literal("phone_verified"),      // Phone number verified
      v.literal("address_verified"),    // Physical address verified
      // Compliance checks
      v.literal("pep_check"),           // Politically exposed person check
      // Custom
      v.literal("custom")               // Custom attestation
    ),
    customType: v.optional(v.string()), // If attestationType is "custom"

    // Issuer information (expanded to support all providers)
    issuer: v.union(
      v.literal("civic"),               // Civic Pass
      v.literal("solid"),               // Solid ID
      v.literal("discard"),             // Self-issued by DisCard
      v.literal("discard_internal"),    // DisCard internal verification
      v.literal("persona"),             // Persona KYC
      v.literal("jumio"),               // Jumio identity verification
      v.literal("onfido"),              // Onfido KYC
      v.literal("sumsub"),              // Sumsub verification
      v.literal("veriff"),              // Veriff identity
      v.literal("manual")               // Manual verification
    ),
    issuerDid: v.optional(v.string()),  // Issuer's DID if applicable

    // On-chain reference (Solana Attestation Service)
    sasAttestationId: v.optional(v.string()),
    sasAttestationAddress: v.optional(v.string()), // Solana account address

    // ZK proof (for privacy-preserving verification)
    zkProof: v.optional(v.bytes()),     // Groth16/Plonk proof
    zkProofType: v.optional(v.string()), // "groth16", "plonk"

    // Encrypted attestation data (for full credential if needed)
    encryptedData: v.optional(v.bytes()),
    encryptionKeyId: v.optional(v.string()),

    // Verification status
    status: v.union(
      v.literal("pending"),             // Awaiting verification
      v.literal("processing"),          // Being verified
      v.literal("active"),              // Valid and active
      v.literal("revoked"),             // Issuer revoked
      v.literal("expired"),             // Past expiry
      v.literal("suspended")            // Temporarily invalid
    ),
    statusReason: v.optional(v.string()), // Reason for current status

    // Revocation info
    revocationReason: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),  // DID of revoker

    // Additional metadata
    metadata: v.optional(v.any()),      // Provider-specific metadata

    // Timestamps
    issuedAt: v.number(),
    expiresAt: v.optional(v.number()),
    lastVerifiedAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()), // When verification completed
    updatedAt: v.optional(v.number()),  // Last update timestamp
  })
    .index("by_user", ["userId"])
    .index("by_did", ["didDocumentId"])
    .index("by_type", ["attestationType"])
    .index("by_issuer", ["issuer"])
    .index("by_status", ["status"])
    .index("by_sas_id", ["sasAttestationId"])
    .index("by_user_type", ["userId", "attestationType"])
    .index("by_chain_address", ["sasAttestationAddress"]),

  // ============ COMPRESSED ACCOUNTS (Light Protocol) ============
  // ZK-compressed state on Solana for cost efficiency
  compressedAccounts: defineTable({
    userId: v.id("users"),

    // Account type
    accountType: v.union(
      v.literal("card_state"),          // Virtual card PDA
      v.literal("did_commitment"),      // DID anchor
      v.literal("policy_state"),        // Transfer hook policy
      v.literal("vault")                // User vault
    ),

    // Reference to related entity
    cardId: v.optional(v.id("cards")),
    didDocumentId: v.optional(v.id("didDocuments")),

    // Light Protocol state
    merkleTreeAddress: v.string(),      // Light Protocol tree address
    leafIndex: v.number(),              // Position in Merkle tree
    stateHash: v.string(),              // Current state commitment

    // Account data (compressed)
    compressedData: v.optional(v.bytes()),

    // Proof info
    lastProofSlot: v.optional(v.number()), // Solana slot of last proof
    lastProofSignature: v.optional(v.string()),

    // Sync status
    syncStatus: v.union(
      v.literal("synced"),
      v.literal("pending_update"),
      v.literal("error")
    ),
    syncError: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_card", ["cardId"])
    .index("by_did", ["didDocumentId"])
    .index("by_type", ["accountType"])
    .index("by_merkle_tree", ["merkleTreeAddress"])
    .index("by_sync_status", ["syncStatus"]),

  // ============ OPTIMISTIC SETTLEMENTS ============
  // Track optimistic UI updates pending blockchain confirmation
  optimisticSettlements: defineTable({
    userId: v.id("users"),
    intentId: v.optional(v.id("intents")),

    // Transaction reference
    optimisticTxId: v.string(),         // Internal tracking ID
    solanaSignature: v.optional(v.string()), // Once submitted

    // What was optimistically updated
    entityType: v.union(
      v.literal("card_balance"),
      v.literal("wallet_balance"),
      v.literal("card_status"),
      v.literal("policy_update")
    ),
    entityId: v.string(),               // Card ID, Wallet ID, etc.

    // Optimistic state change
    previousState: v.any(),             // State before optimistic update
    optimisticState: v.any(),           // State after optimistic update
    finalState: v.optional(v.any()),    // Confirmed state (may differ)

    // Settlement status
    status: v.union(
      v.literal("pending"),             // Awaiting confirmation
      v.literal("submitted"),           // TX submitted to Solana
      v.literal("confirmed"),           // Confirmed on-chain
      v.literal("finalized"),           // Finalized (Alpenglow)
      v.literal("rolled_back"),         // Confirmation failed, reverted
      v.literal("failed")               // TX failed
    ),

    // Confirmation tracking
    confirmationSlot: v.optional(v.number()),
    confirmationTimeMs: v.optional(v.number()), // Time to confirm

    // Error handling
    errorMessage: v.optional(v.string()),
    retryCount: v.number(),

    // Timestamps
    createdAt: v.number(),
    submittedAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    finalizedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_intent", ["intentId"])
    .index("by_signature", ["solanaSignature"])
    .index("by_status", ["status"])
    .index("by_entity", ["entityType", "entityId"]),

  // ============================================================================
  // HOLDINGS & EXPLORE - Token Holdings, Prediction Markets, Trending
  // ============================================================================

  // ============ TOKEN HOLDINGS CACHE ============
  // Cached token holdings from Jupiter Ultra API (per user wallet)
  tokenHoldings: defineTable({
    walletAddress: v.string(),
    mint: v.string(),
    symbol: v.string(),
    name: v.string(),
    decimals: v.number(),
    balance: v.string(), // Raw balance in smallest units
    balanceFormatted: v.number(), // Human-readable balance
    valueUsd: v.number(),
    priceUsd: v.number(),
    change24h: v.number(),
    logoUri: v.optional(v.string()),
    isRwa: v.optional(v.boolean()),
    rwaMetadata: v.optional(
      v.object({
        issuer: v.string(),
        type: v.string(),
        expectedYield: v.optional(v.number()),
      })
    ),
    updatedAt: v.number(),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_mint", ["walletAddress", "mint"])
    .index("by_wallet_rwa", ["walletAddress", "isRwa"]),

  // ============ PREDICTION POSITIONS ============
  // User's tokenized Kalshi prediction market positions via DFlow
  predictionPositions: defineTable({
    userId: v.id("users"),
    walletAddress: v.string(),
    marketId: v.string(),
    ticker: v.string(),
    question: v.string(),
    side: v.union(v.literal("yes"), v.literal("no")),
    mintAddress: v.string(),
    shares: v.number(),
    avgPrice: v.number(),
    currentPrice: v.number(),
    valueUsd: v.number(),
    pnl: v.number(),
    pnlPercent: v.number(),
    marketStatus: v.optional(v.string()),
    endDate: v.optional(v.string()),
    category: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_wallet", ["walletAddress"])
    .index("by_market", ["marketId"]),

  // ============ TRENDING TOKENS CACHE ============
  // Shared cache for Jupiter Tokens API V2 trending/discovery data
  trendingTokens: defineTable({
    category: v.union(
      v.literal("trending"),
      v.literal("top_traded"),
      v.literal("recent")
    ),
    interval: v.string(), // "5m", "1h", "6h", "24h"
    tokens: v.array(
      v.object({
        mint: v.string(),
        symbol: v.string(),
        name: v.string(),
        priceUsd: v.number(),
        change24h: v.number(),
        volume24h: v.number(),
        marketCap: v.optional(v.number()),
        logoUri: v.optional(v.string()),
        verified: v.boolean(),
        organicScore: v.optional(v.number()),
      })
    ),
    updatedAt: v.number(),
  }).index("by_category_interval", ["category", "interval"]),

  // ============ TOKEN DETAILS CACHE ============
  // Cached token details from Jupiter + Helius for token detail screen
  tokenDetails: defineTable({
    mint: v.string(),
    symbol: v.string(),
    name: v.string(),
    priceUsd: v.number(),
    change24h: v.number(),
    // Market data from Jupiter Tokens API V2
    marketCap: v.optional(v.number()),
    volume24h: v.optional(v.number()),
    circulatingSupply: v.optional(v.number()),
    totalSupply: v.optional(v.number()),
    fdv: v.optional(v.number()), // Fully diluted valuation
    // Metadata from Helius DAS (Metaplex)
    description: v.optional(v.string()),
    website: v.optional(v.string()),
    twitter: v.optional(v.string()),
    telegram: v.optional(v.string()),
    discord: v.optional(v.string()),
    logoUri: v.optional(v.string()),
    // Verification status
    verified: v.optional(v.boolean()),
    // Cache metadata
    updatedAt: v.number(),
  })
    .index("by_mint", ["mint"])
    .index("by_symbol", ["symbol"])
    .index("by_updated", ["updatedAt"]),

  // ============ TOKEN OHLCV CACHE ============
  // Cached OHLCV data from Birdeye for performance calculations
  tokenOHLCV: defineTable({
    mint: v.string(),
    period: v.string(), // "1D", "1W", "1M", "3M", "1Y", "ALL"
    data: v.array(
      v.object({
        o: v.number(), // Open
        h: v.number(), // High
        l: v.number(), // Low
        c: v.number(), // Close
        v: v.number(), // Volume
        t: v.number(), // Timestamp
      })
    ),
    updatedAt: v.number(),
  })
    .index("by_mint_period", ["mint", "period"])
    .index("by_updated", ["updatedAt"]),

  // ============ OPEN PREDICTION MARKETS CACHE ============
  // Shared cache for available Kalshi markets via DFlow
  openPredictionMarkets: defineTable({
    marketId: v.string(),
    ticker: v.string(),
    eventId: v.string(),
    question: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("resolved")
    ),
    yesPrice: v.number(),
    noPrice: v.number(),
    volume24h: v.number(),
    endDate: v.string(),
    category: v.string(),
    resolutionSource: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_market", ["marketId"])
    .index("by_category", ["category"])
    .index("by_status", ["status"]),

  // ============================================================================
  // TURNKEY BRIDGE - TEE Signing Infrastructure
  // ============================================================================

  // ============ SIGNING REQUESTS ============
  // Tracks Turnkey TEE signing request lifecycle
  signingRequests: defineTable({
    requestId: v.string(),
    intentId: v.id("intents"),
    userId: v.id("users"),
    subOrganizationId: v.string(),
    walletAddress: v.string(),
    unsignedTransaction: v.string(),
    transactionMessage: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("awaiting_approval"),
      v.literal("signing"),
      v.literal("signed"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("failed"),
      v.literal("rejected"),
      v.literal("rolled_back")
    ),
    turnkeyActivityId: v.optional(v.string()),
    signature: v.optional(v.string()),
    solanaSignature: v.optional(v.string()),
    error: v.optional(v.string()),
    confirmationTimeMs: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_request_id", ["requestId"])
    .index("by_user", ["userId"])
    .index("by_intent", ["intentId"])
    .index("by_activity_id", ["turnkeyActivityId"])
    .index("by_status", ["status"]),

  // ============ SETTLEMENT RECORDS ============
  // Records Solana transaction confirmations and Alpenglow metrics
  settlementRecords: defineTable({
    signingRequestId: v.id("signingRequests"),
    intentId: v.id("intents"),
    userId: v.id("users"),
    requestId: v.optional(v.string()),
    solanaSignature: v.optional(v.string()),
    confirmationTimeMs: v.optional(v.number()),
    withinAlpenglowTarget: v.optional(v.boolean()),
    slot: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("finalized"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_intent", ["intentId"])
    .index("by_signing_request", ["signingRequestId"])
    .index("by_signature", ["solanaSignature"]),

  // ============ TURNKEY ACTIVITIES ============
  // Logs Turnkey activity events for webhook handling
  turnkeyActivities: defineTable({
    signingRequestId: v.id("signingRequests"),
    activityId: v.string(),
    activityType: v.string(),
    status: v.string(),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_signing_request", ["signingRequestId"])
    .index("by_activity_id", ["activityId"])
    .index("by_status", ["status"]),

  // ============================================================================
  // P2P TRANSFERS - Peer-to-peer transfer functionality
  // ============================================================================

  // ============ TRANSFERS ============
  // P2P transfer records for wallet-to-wallet sends
  transfers: defineTable({
    userId: v.id("users"),

    // Recipient identification
    recipientType: v.union(
      v.literal("address"),      // Raw Solana address
      v.literal("sol_name"),     // .sol domain
      v.literal("contact")       // Saved contact
    ),
    recipientIdentifier: v.string(),  // The name/address entered by user
    recipientAddress: v.string(),     // Resolved Solana address
    recipientDisplayName: v.optional(v.string()), // Display name if available

    // Amount details
    amount: v.number(),               // Amount in smallest unit (lamports or token base units)
    token: v.string(),                // Token symbol (SOL, USDC, etc.)
    tokenMint: v.string(),            // Token mint address (native for SOL)
    tokenDecimals: v.number(),        // Token decimals for display
    amountUsd: v.number(),            // USD equivalent (cents)

    // Settlement currency (for cross-currency transfers)
    settlementToken: v.optional(v.string()),        // Token recipient receives (e.g., "USDC", "EURC")
    settlementTokenMint: v.optional(v.string()),    // Settlement token mint address
    settlementTokenDecimals: v.optional(v.number()),// Settlement token decimals
    settlementAmount: v.optional(v.number()),       // Amount recipient receives (base units)
    swapSignature: v.optional(v.string()),          // Jupiter swap transaction signature

    // Merchant payment fields (for cross-currency merchant payments)
    isMerchantPayment: v.optional(v.boolean()),     // Whether this is a merchant payment
    merchantName: v.optional(v.string()),           // Merchant display name
    merchantReceived: v.optional(v.number()),       // Amount merchant received after fees (base units)
    platformFeeAmount: v.optional(v.number()),      // Platform fee deducted (base units)
    exchangeRate: v.optional(v.number()),           // Exchange rate at time of payment

    // Fees
    networkFee: v.number(),           // Solana network fee (lamports)
    platformFee: v.number(),          // Platform fee (0.3%) in token base units
    priorityFee: v.optional(v.number()), // Priority fee if used

    // Memo
    memo: v.optional(v.string()),

    // Transaction details
    solanaSignature: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),           // Created, not yet signed
      v.literal("signing"),           // Awaiting Turnkey signature
      v.literal("submitted"),         // Submitted to Solana
      v.literal("confirmed"),         // Confirmed on-chain
      v.literal("finalized"),         // Finalized (Alpenglow)
      v.literal("failed")             // Transaction failed
    ),
    errorMessage: v.optional(v.string()),

    // Performance tracking
    confirmationTimeMs: v.optional(v.number()),

    // Idempotency
    idempotencyKey: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    signedAt: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_recipient", ["recipientAddress"])
    .index("by_user_recipient", ["userId", "recipientAddress"])
    .index("by_signature", ["solanaSignature"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_created", ["createdAt"]),

  // ============ ON-CHAIN TRANSACTIONS CACHE ============
  // Cached on-chain transaction history from Helius Enhanced API
  onChainTransactions: defineTable({
    walletAddress: v.string(),
    signature: v.string(),
    type: v.union(
      v.literal("send"),
      v.literal("receive"),
      v.literal("swap"),
      v.literal("unknown")
    ),
    counterpartyAddress: v.optional(v.string()),
    tokenMint: v.string(),
    tokenSymbol: v.string(),
    amount: v.number(),              // Human-readable amount
    amountUsd: v.optional(v.number()), // USD value at time of fetch
    fee: v.number(),                 // Transaction fee in SOL
    blockTime: v.number(),           // Unix timestamp
    description: v.optional(v.string()),  // Helius parsed description
    source: v.optional(v.string()),       // Program source (Jupiter, etc.)
    fetchedAt: v.number(),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_time", ["walletAddress", "blockTime"])
    .index("by_signature", ["signature"]),

  // ============ PAYMENT REQUESTS ============
  // Payment request links for requesting money
  paymentRequests: defineTable({
    userId: v.id("users"),

    // Request identification
    requestId: v.string(),            // Unique ID for the link (UUID)

    // Request details
    amount: v.number(),               // Amount in smallest unit
    token: v.string(),                // Token symbol
    tokenMint: v.string(),            // Token mint address
    tokenDecimals: v.number(),
    amountUsd: v.number(),            // USD equivalent (cents)
    memo: v.optional(v.string()),

    // Recipient (who should pay)
    recipientAddress: v.optional(v.string()), // Specific payer if known
    recipientName: v.optional(v.string()),

    // Link types
    linkType: v.union(
      v.literal("solana_pay"),        // Standard Solana Pay URI
      v.literal("deep_link"),         // discard:// deep link
      v.literal("web_link")           // https://www.discard.tech/pay/...
    ),
    linkUrl: v.string(),              // The generated link

    // QR code data (cached for display)
    qrData: v.optional(v.string()),

    // Status tracking
    status: v.union(
      v.literal("pending"),           // Awaiting payment
      v.literal("viewed"),            // Link was opened
      v.literal("paid"),              // Payment received
      v.literal("expired"),           // Past expiry
      v.literal("cancelled")          // User cancelled
    ),

    // Payment tracking
    paymentSignature: v.optional(v.string()),
    payerAddress: v.optional(v.string()),
    transferId: v.optional(v.id("transfers")), // Link to transfer record

    // Expiry
    expiresAt: v.number(),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    viewedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_request_id", ["requestId"])
    .index("by_status", ["status"])
    .index("by_expires", ["expiresAt"]),

  // ============ CONTACTS ============
  // Saved contacts for quick transfers
  contacts: defineTable({
    userId: v.id("users"),

    // Contact identity
    name: v.string(),                 // Display name
    identifier: v.string(),           // .sol name, address, phone, email, etc.
    identifierType: v.union(
      v.literal("address"),           // Raw Solana address
      v.literal("sol_name"),          // .sol domain name
      v.literal("phone"),             // Phone number (E.164)
      v.literal("email")              // Email address
    ),
    resolvedAddress: v.string(),      // Cached resolved address

    // DisCard user linking
    linkedUserId: v.optional(v.id("users")), // If contact is a DisCard user
    phoneNumber: v.optional(v.string()),     // Contact's phone number
    email: v.optional(v.string()),           // Contact's email

    // Display
    avatarInitials: v.string(),       // First letters for avatar
    avatarColor: v.optional(v.string()), // Optional color override
    verified: v.boolean(),            // Is this a verified contact

    // Favorites
    isFavorite: v.optional(v.boolean()), // Mark as favorite contact

    // Usage tracking
    lastUsedAt: v.optional(v.number()),
    transferCount: v.number(),        // Number of transfers to this contact
    totalAmountSent: v.number(),      // Total USD sent (cents)

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_address", ["userId", "resolvedAddress"])
    .index("by_user_recent", ["userId", "lastUsedAt"])
    .index("by_user_name", ["userId", "name"]),

  // ============ INVITATIONS ============
  // SMS invitations for non-registered users
  invitations: defineTable({
    senderId: v.id("users"),

    // Recipient identification
    recipientPhone: v.string(),            // E.164 phone number
    inviteCode: v.string(),                // Unique code for tracking/claiming
    message: v.optional(v.string()),       // Custom invitation message

    // Pending transfer (optional)
    pendingTransferId: v.optional(v.id("transfers")),
    pendingAmount: v.optional(v.number()), // Amount in cents
    pendingToken: v.optional(v.string()),  // Token symbol

    // Delivery status
    deliveryStatus: v.union(
      v.literal("pending"),                // Created, not yet sent
      v.literal("sent"),                   // SMS delivered
      v.literal("failed")                  // SMS failed
    ),
    deliveryError: v.optional(v.string()), // Error message if failed

    // Claim status
    claimStatus: v.union(
      v.literal("unclaimed"),              // Not yet claimed
      v.literal("claimed"),                // User signed up
      v.literal("expired")                 // Expired without claim
    ),
    claimedByUserId: v.optional(v.id("users")),
    claimedAt: v.optional(v.number()),

    // Timestamps
    expiresAt: v.number(),                 // Expiry timestamp
    createdAt: v.number(),
  })
    .index("by_sender", ["senderId"])
    .index("by_invite_code", ["inviteCode"])
    .index("by_phone", ["recipientPhone"])
    .index("by_claim_status", ["claimStatus"])
    .index("by_expires", ["expiresAt"]),

  // ============================================================================
  // PHONE VERIFICATIONS - OTP verification for P2P discovery
  // ============================================================================
  phoneVerifications: defineTable({
    userId: v.id("users"),
    phoneNumber: v.string(),           // E.164 format
    code: v.string(),                  // 6-digit OTP
    attempts: v.number(),              // Failed verification attempts (max 3)
    status: v.union(
      v.literal("pending"),            // OTP sent, awaiting verification
      v.literal("verified"),           // Successfully verified
      v.literal("expired"),            // Timed out (10 min)
      v.literal("failed")              // Too many failed attempts
    ),
    expiresAt: v.number(),             // 10-minute expiry
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_phone", ["phoneNumber"])
    .index("by_expires", ["expiresAt"]),

  // ============================================================================
  // GOALS - User savings goals and strategies
  // ============================================================================
  goals: defineTable({
    userId: v.id("users"),

    // Goal details
    title: v.string(),                   // "Stack 0.1 BTC", "Emergency Fund"
    type: v.union(
      v.literal("savings"),              // Save X USD amount
      v.literal("accumulate"),           // Stack X of a specific token
      v.literal("yield"),                // Earn X% yield
      v.literal("custom")                // Custom goal
    ),

    // Target and progress
    targetAmount: v.number(),            // Target value (USD cents for savings, token units for accumulate)
    targetToken: v.optional(v.string()), // Token symbol (BTC, ETH, SOL, etc.)
    currentAmount: v.number(),           // Current progress

    // Optional deadline
    deadline: v.optional(v.number()),    // Timestamp for deadline

    // Status
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled")
    ),

    // ===== SAFETY ARCHITECTURE: Time-Bound Goals & Automation =====

    // Automation configuration
    automationEnabled: v.optional(v.boolean()),     // Enable automated contributions
    automationConfig: v.optional(v.object({
      triggerType: v.union(
        v.literal("schedule"),           // Recurring schedule (daily, weekly, monthly)
        v.literal("price_target"),       // When token reaches price target
        v.literal("balance_threshold")   // When wallet balance exceeds threshold
      ),
      scheduleInterval: v.optional(v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly")
      )),
      priceTargetUsd: v.optional(v.number()),       // Price target in cents
      balanceThresholdCents: v.optional(v.number()), // Balance threshold in cents
      maxSingleAmountCents: v.optional(v.number()), // Max per automated transaction
      sourceWalletId: v.optional(v.id("wallets")),  // Wallet to fund from
    })),
    lastAutomatedAt: v.optional(v.number()),        // Last automated contribution timestamp
    nextAutomatedAt: v.optional(v.number()),        // Next scheduled contribution

    // Re-approval requirements
    requiresReapproval: v.optional(v.boolean()),    // Whether goal needs periodic re-approval
    reapprovalIntervalMs: v.optional(v.number()),   // How often to require re-approval (e.g., 30 days)
    lastApprovedAt: v.optional(v.number()),         // Last time user approved/confirmed the goal
    nextReapprovalAt: v.optional(v.number()),       // When next re-approval is due

    // Auto-expiry for time-sensitive goals
    autoExpireAt: v.optional(v.number()),           // Goal auto-cancels after this timestamp

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_next_automated", ["nextAutomatedAt"])
    .index("by_next_reapproval", ["nextReapprovalAt"])
    .index("by_auto_expire", ["autoExpireAt"]),

  // ============================================================================
  // DEPOSIT ADDRESSES - Single-use addresses for Privacy Cash auto-shield
  // ============================================================================
  depositAddresses: defineTable({
    userId: v.id("users"),

    // Address details
    address: v.string(),                 // Solana deposit address
    walletId: v.string(),                // Turnkey wallet ID

    // Session key for auto-shield (restricted to Privacy Cash pool only)
    sessionKeyId: v.string(),            // Turnkey API key ID
    policyId: v.string(),                // Turnkey policy ID

    // Status
    status: v.union(
      v.literal("pending"),              // Awaiting deposit
      v.literal("funded"),               // Deposit received
      v.literal("shielded"),             // Funds moved to shielded pool
      v.literal("expired")               // Address expired unused
    ),

    // Timestamps
    expiresAt: v.number(),               // 30-minute expiry
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_address", ["address"])
    .index("by_status", ["status"]),

  // ============================================================================
  // SHIELDED COMMITMENTS - Privacy Cash shielded balance tracking
  // ============================================================================
  shieldedCommitments: defineTable({
    userId: v.id("users"),

    // ZK commitment details
    commitmentId: v.optional(v.string()),   // Unique commitment ID
    commitment: v.optional(v.string()),     // Public commitment hash
    encryptedAmount: v.optional(v.string()), // Encrypted amount (for user decryption)
    encryptedRandomness: v.optional(v.string()), // Encrypted randomness (for user decryption)
    nullifier: v.optional(v.string()),      // Nullifier for double-spend prevention

    // Commitment details
    amount: v.number(),                  // Amount in base units (e.g., USDC)
    sourceType: v.string(),              // "moonpay", "transfer", etc.
    sourceId: v.string(),                // Source transaction ID

    // Blockchain reference
    shieldTxSignature: v.optional(v.string()), // Shield transaction signature

    // Spending status
    spent: v.optional(v.boolean()),      // Whether commitment has been spent
    spentAt: v.optional(v.number()),     // When commitment was spent
    spentTxSignature: v.optional(v.string()), // Spending transaction signature

    // Status
    status: v.union(
      v.literal("shielded"),             // Funds in shielded pool
      v.literal("unshielding"),          // Withdrawal in progress
      v.literal("unshielded")            // Funds withdrawn
    ),

    // Timestamps
    createdAt: v.number(),
    unshieldedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  // ============================================================================
  // MAGICBLOCK SESSIONS - Ephemeral rollup sessions for card authorization
  // ============================================================================
  magicblockSessions: defineTable({
    cardId: v.id("cards"),
    userId: v.id("users"),

    // Session identification
    sessionId: v.string(),               // MagicBlock session ID
    clusterEndpoint: v.string(),         // PER cluster endpoint

    // Delegated state
    delegatedAccounts: v.array(v.string()), // Account pubkeys delegated to PER

    // Session state
    status: v.union(
      v.literal("creating"),             // Session being initialized
      v.literal("active"),               // Session active, processing authorizations
      v.literal("committing"),           // Final batch being committed
      v.literal("committed"),            // Session completed, state on L1
      v.literal("expired"),              // Session expired
      v.literal("failed")                // Session failed
    ),

    // Metrics
    transactionCount: v.number(),        // Total authorizations processed
    lastCommitAt: v.optional(v.number()), // Last batch commit timestamp

    // Timestamps
    expiresAt: v.number(),               // Session expiration
    createdAt: v.number(),
  })
    .index("by_card", ["cardId"])
    .index("by_user", ["userId"])
    .index("by_session", ["sessionId"])
    .index("by_status", ["status"]),

  // ============================================================================
  // AUTHORIZATION BATCHES - Batch commits from MagicBlock PER to Solana L1
  // ============================================================================
  authorizationBatches: defineTable({
    sessionId: v.string(),               // MagicBlock session ID

    // Batch content
    merkleRoot: v.string(),              // Merkle root of all decisions
    decisionCount: v.number(),           // Number of decisions in batch

    // Timestamps
    startTimestamp: v.number(),          // First decision in batch
    endTimestamp: v.number(),            // Last decision in batch
    committedAt: v.number(),             // When batch was committed

    // Blockchain reference
    txSignature: v.optional(v.string()), // Solana transaction signature

    // Status
    status: v.union(
      v.literal("pending"),              // Batch created, not yet submitted
      v.literal("submitted"),            // Transaction submitted
      v.literal("confirmed"),            // Transaction confirmed on L1
      v.literal("failed")                // Transaction failed
    ),
  })
    .index("by_session", ["sessionId"])
    .index("by_status", ["status"])
    .index("by_committed", ["committedAt"]),

  // ============================================================================
  // ZK PROOFS - On-chain ZK proof verification records (Sunspot/Groth16)
  // ============================================================================
  zkProofs: defineTable({
    userId: v.id("users"),
    cardId: v.optional(v.id("cards")),

    // Proof type
    proofType: v.union(
      v.literal("spending_limit"),       // Prove balance >= amount
      v.literal("compliance"),           // Prove not sanctioned
      v.literal("balance_threshold"),    // Prove balance meets threshold
      v.literal("age_verification"),     // Prove age >= threshold
      v.literal("kyc_level")             // Prove KYC level >= required
    ),

    // Proof data
    publicInputs: v.string(),            // JSON serialized public inputs
    proofHash: v.string(),               // Hash of the proof for deduplication

    // Verification result
    verified: v.boolean(),               // Whether proof was verified on-chain
    verifiedAt: v.optional(v.number()),  // Verification timestamp

    // Blockchain reference
    txSignature: v.optional(v.string()), // Verification transaction signature

    // Timestamps
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_card", ["cardId"])
    .index("by_proof_type", ["proofType"])
    .index("by_verified", ["verified"]),

  // ============================================================================
  // STEALTH ADDRESSES - Hush-style disposable addresses for card funding
  // ============================================================================
  stealthAddresses: defineTable({
    userId: v.id("users"),
    cardId: v.optional(v.id("cards")),

    // Address data
    stealthAddress: v.string(),          // ECDH-derived stealth address
    ephemeralPubKey: v.string(),         // Ephemeral public key for derivation

    // Purpose
    purpose: v.union(
      v.literal("card_funding"),         // Fund a card
      v.literal("merchant_payment"),     // Pay a merchant
      v.literal("p2p_transfer")          // Private P2P transfer
    ),

    // State
    used: v.boolean(),                   // Whether address has been used
    amount: v.optional(v.number()),      // Amount received (after use)

    // Blockchain reference
    txSignature: v.optional(v.string()), // Transaction signature when used

    // Timestamps
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_card", ["cardId"])
    .index("by_address", ["stealthAddress"])
    .index("by_used", ["used"]),

  // ============================================================================
  // KEY IMAGES - Ring signature double-spend prevention (ShadowWire)
  // ============================================================================
  keyImages: defineTable({
    keyImageHash: v.string(),            // Hash of the key image (prevents double-signing)
    userId: v.optional(v.id("users")),   // User who used this key image (for audit)
    
    // Transaction reference
    txSignature: v.optional(v.string()), // Solana transaction signature
    messageHash: v.string(),             // Message that was signed
    
    // Ring signature metadata
    ringSize: v.number(),                // Number of members in ring
    
    // Timestamps
    createdAt: v.number(),               // When key image was first used
    expiresAt: v.optional(v.number()),   // Optional expiry for cleanup
  })
    .index("by_key_image", ["keyImageHash"])
    .index("by_user", ["userId"])
    .index("by_created", ["createdAt"]),

  // ============================================================================
  // UMBRA POOL TRANSFERS - Shielded pool transfers via Arcium
  // ============================================================================
  umbraTransfers: defineTable({
    userId: v.id("users"),

    // Card references
    sourceCardId: v.optional(v.id("cards")),   // Source card for deposits
    targetCardId: v.optional(v.id("cards")),   // Target card for withdrawals

    // Note identification
    noteId: v.string(),                  // Unique deposit note ID
    sourceNoteId: v.optional(v.string()), // Original note ID (for withdrawals)

    // Transfer details
    commitment: v.string(),              // Balance commitment hash
    nullifier: v.string(),               // Nullifier for double-spend prevention
    encryptedAmount: v.string(),         // ElGamal encrypted amount
    poolId: v.string(),                  // Pool program ID

    // Transfer type
    type: v.union(
      v.literal("deposit"),              // User → Pool
      v.literal("withdrawal")            // Pool → Card/Wallet
    ),

    // Recipient (for withdrawals)
    recipientAddress: v.optional(v.string()),  // Recipient wallet address

    // Status
    status: v.union(
      v.literal("pending"),              // Transfer initiated
      v.literal("confirmed"),            // Deposit confirmed on-chain
      v.literal("withdrawing"),          // Withdrawal in progress
      v.literal("withdrawn"),            // Withdrawal complete
      v.literal("failed")                // Transfer failed
    ),

    // Cross-card transfer flag
    isCardTransfer: v.optional(v.boolean()),

    // Blockchain reference
    txSignature: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    confirmedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_source_card", ["sourceCardId"])
    .index("by_target_card", ["targetCardId"])
    .index("by_note", ["noteId"])
    .index("by_status", ["status"])
    .index("by_type", ["type"]),

  // ============================================================================
  // NULLIFIERS - ZK Proof Replay Protection
  // ============================================================================
  nullifiers: defineTable({
    // Nullifier hash (unique identifier)
    nullifier: v.string(),

    // Proof metadata
    proofType: v.string(),                 // "spending_limit", "compliance", etc.
    proofHash: v.optional(v.string()),     // Hash of the proof that generated this nullifier

    // Usage tracking
    usedAt: v.number(),                    // When nullifier was first used
    usedBy: v.optional(v.id("users")),     // User who used the proof
    context: v.optional(v.string()),       // Additional context (e.g., transaction ID)

    // Expiry (for cleanup)
    expiresAt: v.number(),                 // When this nullifier expires

    // Status
    status: v.union(
      v.literal("active"),                 // Currently preventing replay
      v.literal("expired")                 // Expired, can be cleaned up
    ),
  })
    .index("by_nullifier", ["nullifier"])
    .index("by_proof_type", ["proofType"])
    .index("by_expires", ["expiresAt"])
    .index("by_status", ["status"])
    .index("by_user", ["usedBy"]),

  // ============================================================================
  // ENCRYPTED CREDENTIALS - Private Identity Vault (E2EE)
  // ============================================================================
  encryptedCredentials: defineTable({
    userId: v.id("users"),
    
    // Credential identification
    credentialId: v.string(),              // Unique credential ID
    
    // ENCRYPTED DATA (client-side encrypted before storage)
    encryptedData: v.string(),             // NaCl secretbox encrypted credential
    
    // Metadata (safe to store unencrypted)
    credentialHash: v.string(),            // Hash for deduplication
    attestationType: v.string(),           // Type of attestation
    issuer: v.string(),                    // Issuer name
    availableProofs: v.array(v.string()),  // Proof types available
    
    // Expiry
    expiresAt: v.optional(v.number()),     // Credential expiry
    
    // Timestamps
    storedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_credential", ["userId", "credentialId"])
    .index("by_type", ["attestationType"])
    .index("by_expires", ["expiresAt"]),

  // ============================================================================
  // DEPOSIT NOTES - Umbra Pool Notes (E2EE)
  // ============================================================================
  depositNotes: defineTable({
    userId: v.id("users"),
    
    // Note identification
    noteId: v.string(),                    // Unique note ID
    
    // ENCRYPTED NOTE DATA
    // Contains: commitment, nullifier, encryptedAmount, randomness
    encryptedNote: v.string(),             // Entire note encrypted
    
    // Pool reference (public)
    poolId: v.string(),
    
    // Spending status
    spent: v.boolean(),
    spentAt: v.optional(v.number()),
    spentTxSignature: v.optional(v.string()),
    
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_note", ["userId", "noteId"])
    .index("by_spent", ["spent"]),

  // ============================================================================
  // PRIVACY DEPOSIT ADDRESSES - Unlinkable KYC/Address Storage
  // ============================================================================
  // Stores deposit addresses SEPARATELY from user identity to prevent
  // MoonPay (or other KYC providers) from linking wallet addresses to users.
  // NO userId field - lookup is only by addressHash.
  privacyDepositAddresses: defineTable({
    // Hash of the deposit address (SHA-256 with domain separator)
    // Used for lookups without exposing the actual address
    addressHash: v.string(),

    // The actual deposit address (encrypted in production)
    // Only accessible via addressHash lookup, not userId
    encryptedAddress: v.string(),

    // Reference to the transaction (but transaction does NOT store address)
    transactionId: v.id("moonpayTransactions"),

    // Purpose of this deposit address
    purpose: v.union(
      v.literal("moonpay_deposit"),
      v.literal("iban_deposit"),
      v.literal("card_funding"),
      v.literal("other")
    ),

    // Timestamps
    createdAt: v.number(),
    // Auto-delete after retention period (24 hours default)
    expiresAt: v.number(),
  })
    .index("by_hash", ["addressHash"])
    .index("by_transaction", ["transactionId"])
    .index("by_expiry", ["expiresAt"]),

  // ============================================================================
  // WALLET BACKUPS - Encrypted Seed Phrase Backup Metadata
  // ============================================================================
  // Tracks backup metadata only (NOT the encrypted seed itself).
  // The encrypted backup is stored in cloud storage (iCloud/Google Drive/local file).
  // This table allows users to see their backup history and verify backups.
  walletBackups: defineTable({
    // User who created the backup
    userId: v.id("users"),

    // Unique backup identifier
    backupId: v.string(),

    // Where the backup is stored
    backupProvider: v.union(
      v.literal("icloud"),
      v.literal("google_drive"),
      v.literal("local_file")
    ),

    // Hash of the encrypted backup for verification
    // This allows checking if a downloaded backup matches what was uploaded
    backupHash: v.string(),

    // Wallet fingerprint (first 8 chars of mnemonic hash)
    // Used to verify backup matches current wallet without decrypting
    walletFingerprint: v.optional(v.string()),

    // Device info for user reference
    deviceName: v.optional(v.string()),

    // Mnemonic word count (12 or 24)
    wordCount: v.optional(v.number()),

    // Status
    status: v.union(
      v.literal("active"),       // Current active backup
      v.literal("superseded"),   // Replaced by newer backup
      v.literal("deleted")       // User deleted this backup
    ),

    // Timestamps
    createdAt: v.number(),
    verifiedAt: v.optional(v.number()), // When user last verified backup
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_backup_id", ["backupId"])
    .index("by_hash", ["backupHash"]),

  // ============ REQUEST QUEUE (Timing Obfuscation) ============
  // Queue for delayed/batched RPC requests for privacy
  requestQueue: defineTable({
    requestId: v.string(),
    userId: v.string(),
    endpoint: v.string(),
    method: v.string(),
    params: v.any(),
    privacyLevel: v.union(
      v.literal("basic"),
      v.literal("enhanced"),
      v.literal("maximum")
    ),
    executeAfter: v.number(),     // Timestamp when request should execute
    status: v.union(
      v.literal("queued"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    executedAt: v.optional(v.number()),
  })
    .index("by_status_execute", ["status", "executeAfter"])
    .index("by_request_id", ["requestId"])
    .index("by_user", ["userId"]),

  // ============================================================================
  // SAFETY ARCHITECTURE - Double-Gated Intent → Plan → Validate → Execute
  // ============================================================================

  // ============ EXECUTION PLANS ============
  // Structured multi-step plans from intents with cost estimates and risk levels
  executionPlans: defineTable({
    intentId: v.id("intents"),
    userId: v.id("users"),
    planId: v.string(),                    // UUID for external reference

    // Human-readable summary
    goalRecap: v.string(),                 // "Fund your card with $50 from wallet"

    // Step-by-step execution plan
    steps: v.array(v.object({
      stepId: v.string(),
      sequence: v.number(),
      action: v.string(),                  // Action type (fund_card, transfer, swap, etc.)
      description: v.string(),             // Human-readable description
      estimatedCost: v.object({
        maxSpendCents: v.number(),
        maxSlippageBps: v.number(),        // Basis points (100 = 1%)
        riskLevel: v.union(
          v.literal("low"),
          v.literal("medium"),
          v.literal("high"),
          v.literal("critical")
        ),
      }),
      expectedOutcome: v.string(),
      dependsOn: v.array(v.string()),      // Step IDs this step depends on
      requiresSoulVerification: v.boolean(),
      requiresUserApproval: v.boolean(),
      simulationRequired: v.boolean(),
      status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("executing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("skipped")
      ),
    })),

    // Cost aggregation
    totalMaxSpendCents: v.number(),
    totalEstimatedFeeCents: v.number(),
    overallRiskLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),

    // Plan lifecycle status
    status: v.union(
      v.literal("draft"),                  // Plan created, not yet evaluated
      v.literal("policy_review"),          // Being evaluated by policy engine
      v.literal("policy_rejected"),        // Blocked by policy violation
      v.literal("awaiting_approval"),      // Waiting for user approval
      v.literal("approved"),               // User approved, ready to execute
      v.literal("executing"),              // Currently executing
      v.literal("completed"),              // All steps completed successfully
      v.literal("failed"),                 // Execution failed
      v.literal("cancelled")               // User cancelled
    ),

    // Policy evaluation results
    policyResult: v.optional(v.object({
      approved: v.boolean(),
      violations: v.array(v.object({
        policyId: v.string(),
        policyName: v.string(),
        severity: v.union(v.literal("warning"), v.literal("block")),
        message: v.string(),
      })),
      evaluatedAt: v.number(),
    })),

    // Approval mode determined by policy engine
    approvalMode: v.union(
      v.literal("auto"),                   // Auto-approve after countdown
      v.literal("manual"),                 // Requires explicit user approval
      v.literal("blocked")                 // Cannot proceed (policy violation)
    ),
    autoApproveCountdownMs: v.optional(v.number()), // Countdown duration if auto mode

    // Timestamps
    createdAt: v.number(),
    expiresAt: v.number(),                 // Plans expire after 30 minutes
    approvedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_intent", ["intentId"])
    .index("by_plan_id", ["planId"])
    .index("by_status", ["status"])
    .index("by_user_status", ["userId", "status"]),

  // ============ USER POLICIES ============
  // User-defined and system policies for safety evaluation
  userPolicies: defineTable({
    userId: v.id("users"),
    policyId: v.string(),                  // UUID for external reference
    policyName: v.string(),                // Human-readable name

    // Policy ownership
    policyType: v.union(
      v.literal("system"),                 // Hardcoded, cannot be disabled
      v.literal("default"),                // Enabled by default, can be disabled
      v.literal("user")                    // User-created custom policy
    ),

    // Policy rule definition
    rule: v.object({
      type: v.union(
        v.literal("max_transaction_value"),
        v.literal("daily_limit"),
        v.literal("weekly_limit"),
        v.literal("monthly_limit"),
        v.literal("allowed_protocols"),
        v.literal("blocked_actions"),
        v.literal("time_window"),
        v.literal("simulation_required"),
        v.literal("max_slippage")
      ),
      // Thresholds (used based on rule type)
      thresholdCents: v.optional(v.number()),
      thresholdBps: v.optional(v.number()),
      // Lists (used for allowed/blocked rules)
      protocols: v.optional(v.array(v.string())),
      actions: v.optional(v.array(v.string())),
      // Time window (24-hour format, e.g., "02:00", "06:00")
      timeWindowStart: v.optional(v.string()),
      timeWindowEnd: v.optional(v.string()),
    }),

    // Violation severity
    severity: v.union(
      v.literal("warning"),                // Show warning but allow
      v.literal("block")                   // Block the operation
    ),

    // Policy state
    isEnabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_enabled", ["userId", "isEnabled"])
    .index("by_policy_type", ["policyType"]),

  // ============ APPROVAL QUEUE ============
  // Pending approvals with preview data and countdown
  approvalQueue: defineTable({
    userId: v.id("users"),
    planId: v.id("executionPlans"),
    intentId: v.id("intents"),

    // Human-readable preview for UI
    preview: v.object({
      goalRecap: v.string(),               // "Fund your card with $50"
      stepsPreview: v.array(v.object({
        description: v.string(),
        estimatedCostUsd: v.string(),      // "$50.00"
        riskLevel: v.string(),             // "low", "medium", "high", "critical"
      })),
      totalMaxSpendUsd: v.string(),        // "$50.00"
      estimatedFeesUsd: v.string(),        // "$0.30"
      expectedOutcome: v.string(),         // "Your card ending in 1234 will be funded"
      warnings: v.array(v.string()),       // Policy warnings to display
    }),

    // Approval mode and countdown
    approvalMode: v.union(
      v.literal("auto"),                   // Auto-approve after countdown
      v.literal("manual")                  // Requires explicit approval
    ),
    countdownStartedAt: v.optional(v.number()),
    countdownDurationMs: v.optional(v.number()),
    autoApproveAt: v.optional(v.number()), // Timestamp when auto-approve triggers

    // Approval status
    status: v.union(
      v.literal("pending"),                // Created, not yet started
      v.literal("counting_down"),          // Countdown in progress
      v.literal("approved"),               // User approved or countdown completed
      v.literal("rejected"),               // User rejected
      v.literal("cancelled"),              // User cancelled during countdown
      v.literal("expired")                 // Expired without action
    ),

    // Action metadata
    approvedBy: v.optional(v.string()),    // "user" or "auto"
    rejectionReason: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    expiresAt: v.number(),                 // 5-minute expiry for pending approvals
    resolvedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_plan", ["planId"])
    .index("by_intent", ["intentId"])
    .index("by_status", ["status"])
    .index("by_auto_approve", ["autoApproveAt"]),

  // ============ CIRCUIT BREAKERS ============
  // Kill switches for emergency operation control
  circuitBreakers: defineTable({
    userId: v.id("users"),
    breakerId: v.string(),                 // UUID for external reference
    breakerName: v.string(),               // Human-readable name

    // Breaker scope
    breakerType: v.union(
      v.literal("global"),                 // Pause ALL operations
      v.literal("action_type"),            // Pause specific action types
      v.literal("goal"),                   // Pause specific goal's automation
      v.literal("protocol")                // Pause specific protocol interactions
    ),

    // Scope specification (depends on breakerType)
    scope: v.optional(v.object({
      actionType: v.optional(v.string()),  // For action_type breaker
      goalId: v.optional(v.id("goals")),   // For goal breaker
      protocol: v.optional(v.string()),    // For protocol breaker
    })),

    // Breaker state
    isTripped: v.boolean(),
    trippedAt: v.optional(v.number()),
    trippedBy: v.optional(v.string()),     // "user", "system", "fraud_detection"
    tripReason: v.optional(v.string()),

    // Auto-reset configuration
    autoResetAfterMs: v.optional(v.number()), // Optional auto-reset duration

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "breakerType"])
    .index("by_tripped", ["isTripped"]),

  // ============ AUDIT LOG ============
  // Hash-chained audit trail for verifiable action history
  auditLog: defineTable({
    userId: v.id("users"),
    eventId: v.string(),                   // UUID for external reference
    sequence: v.number(),                  // Monotonically increasing per user

    // Event classification
    eventType: v.union(
      v.literal("intent_created"),
      v.literal("plan_generated"),
      v.literal("policy_evaluated"),
      v.literal("approval_requested"),
      v.literal("approval_granted"),
      v.literal("approval_rejected"),
      v.literal("countdown_started"),
      v.literal("countdown_cancelled"),
      v.literal("execution_started"),
      v.literal("execution_completed"),
      v.literal("execution_failed"),
      v.literal("breaker_tripped"),
      v.literal("breaker_reset"),
      v.literal("policy_created"),
      v.literal("policy_updated"),
      v.literal("threshold_changed")
    ),

    // Related entities
    intentId: v.optional(v.id("intents")),
    planId: v.optional(v.id("executionPlans")),
    approvalId: v.optional(v.id("approvalQueue")),

    // Event data (varies by eventType)
    eventData: v.object({
      action: v.optional(v.string()),
      amountCents: v.optional(v.number()),
      targetId: v.optional(v.string()),
      reason: v.optional(v.string()),
      violations: v.optional(v.array(v.string())),
      metadata: v.optional(v.any()),
    }),

    // Hash chain for tamper detection
    previousHash: v.string(),              // Hash of previous event (or "genesis")
    eventHash: v.string(),                 // SHA-256 hash of this event

    // On-chain anchoring
    anchoredToChain: v.boolean(),
    anchorTxSignature: v.optional(v.string()),
    anchorMerkleRoot: v.optional(v.string()),

    // Timestamps
    timestamp: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_sequence", ["userId", "sequence"])
    .index("by_event_type", ["eventType"])
    .index("by_intent", ["intentId"])
    .index("by_plan", ["planId"])
    .index("by_anchored", ["anchoredToChain"])
    .index("by_timestamp", ["timestamp"]),

  // ============ APPROVAL THRESHOLDS ============
  // User-configurable approval thresholds
  approvalThresholds: defineTable({
    userId: v.id("users"),

    // Auto-approval threshold (below this, auto-approve with countdown)
    autoApproveMaxCents: v.number(),       // Default: $100 (10000 cents)

    // Manual approval threshold (above this, requires explicit approval)
    manualApproveMaxCents: v.number(),     // Default: $10,000 (1000000 cents)

    // Countdown timing configuration
    countdownBaseDurationMs: v.number(),   // Default: 5000 (5 seconds)
    countdownPerDollarMs: v.number(),      // Default: 100 (1 sec per $10)
    countdownMaxDurationMs: v.number(),    // Default: 30000 (30 seconds)

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),

});
