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

    // Profile
    displayName: v.optional(v.string()),
    phoneHash: v.optional(v.string()),  // For TextPay PDA derivation
    email: v.optional(v.string()),      // Optional, for notifications only

    // Privacy settings
    privacySettings: v.object({
      dataRetention: v.number(),        // Days to retain data
      analyticsOptOut: v.boolean(),
      transactionIsolation: v.boolean(), // Enable card context isolation
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
    .index("by_solana_address", ["solanaAddress"])
    .index("by_email", ["email"]),

  // ============ INTENTS ============
  // Command Bar entries - natural language to transaction instructions
  intents: defineTable({
    userId: v.id("users"),

    // Raw input from Command Bar
    rawText: v.string(),                // "Pay this bill with my ETH yield"

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
        v.literal("pay_bill")
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
    parsedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  // ============ CARDS ============
  // Virtual disposable cards with privacy isolation
  cards: defineTable({
    userId: v.id("users"),

    // Card identity and privacy isolation
    cardContext: v.string(),            // SHA-256 hash for transaction isolation
    marqetaCardToken: v.optional(v.string()), // Marqeta card reference
    marqetaUserToken: v.optional(v.string()), // Marqeta user reference

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
    .index("by_status", ["status"]),

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

    // Destination wallet for crypto
    walletAddress: v.optional(v.string()),

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

    // TEE-generated wallet
    walletId: v.string(),               // Turnkey wallet ID
    walletAddress: v.string(),          // Solana address derived in TEE
    walletPublicKey: v.string(),        // Ed25519 public key (base58)

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
    didDocumentId: v.id("didDocuments"),

    // Attestation type
    attestationType: v.union(
      v.literal("age_over_18"),
      v.literal("age_over_21"),
      v.literal("uk_resident"),
      v.literal("us_resident"),
      v.literal("eu_resident"),
      v.literal("kyc_level_1"),         // Basic identity
      v.literal("kyc_level_2"),         // Enhanced with address
      v.literal("kyc_level_3"),         // Full with source of funds
      v.literal("accredited_investor"),
      v.literal("recovery_guardian"),   // Can act as guardian for others
      v.literal("custom")               // Custom attestation
    ),
    customType: v.optional(v.string()), // If attestationType is "custom"

    // Issuer information
    issuer: v.union(
      v.literal("civic"),               // Civic Pass
      v.literal("solid"),               // Solid ID
      v.literal("discard"),             // Self-issued by DisCard
      v.literal("persona"),             // Persona KYC
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

    // Revocation info
    revocationReason: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),  // DID of revoker

    // Timestamps
    issuedAt: v.number(),
    expiresAt: v.optional(v.number()),
    lastVerifiedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_did", ["didDocumentId"])
    .index("by_type", ["attestationType"])
    .index("by_issuer", ["issuer"])
    .index("by_status", ["status"])
    .index("by_sas_id", ["sasAttestationId"]),

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
});
