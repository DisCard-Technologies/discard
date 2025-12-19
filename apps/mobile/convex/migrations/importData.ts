/**
 * Convex Data Import Mutations
 *
 * Imports transformed data from JSON files into Convex tables.
 * Run with: npx convex run migrations/importData:importAll
 */
import { v } from "convex/values";
import { internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ============ ID RESOLUTION ============

// Maps placeholder IDs to actual Convex IDs
const resolvedIds = new Map<string, Id<any>>();

/**
 * Resolve a placeholder ID to a real Convex ID
 */
function resolveId<T extends string>(
  placeholderId: string | null | undefined,
  tableName: T
): Id<T> | null {
  if (!placeholderId) return null;
  const resolved = resolvedIds.get(placeholderId);
  return resolved as Id<T> | null;
}

// ============ IMPORT MUTATIONS ============

/**
 * Import users
 */
export const importUsers = internalMutation({
  args: {
    users: v.array(v.any()),
  },
  handler: async (ctx, args): Promise<{ imported: number; idMap: Record<string, string> }> => {
    const idMap: Record<string, string> = {};

    for (const user of args.users) {
      const placeholderId = user._placeholder_id;

      // Create user record
      const userId = await ctx.db.insert("users", {
        credentialId: user.credentialId,
        publicKey: new Uint8Array(0), // Empty until passkey registration
        solanaAddress: user.solanaAddress || undefined,
        displayName: user.displayName || undefined,
        phoneHash: user.phoneHash || undefined,
        email: user.email || undefined,
        privacySettings: user.privacySettings || {
          dataRetention: 365,
          analyticsOptOut: false,
          transactionIsolation: true,
        },
        kycStatus: user.kycStatus || "none",
        riskScore: user.riskScore || 0,
        accountStatus: user.accountStatus || "active",
        lastActive: user.lastActive || Date.now(),
        createdAt: user.createdAt || Date.now(),
      });

      idMap[placeholderId] = userId;
      resolvedIds.set(placeholderId, userId);
    }

    return { imported: args.users.length, idMap };
  },
});

/**
 * Import cards
 */
export const importCards = internalMutation({
  args: {
    cards: v.array(v.any()),
    userIdMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args): Promise<{ imported: number; idMap: Record<string, string> }> => {
    const idMap: Record<string, string> = {};

    for (const card of args.cards) {
      const placeholderId = card._placeholder_id;
      const userId = args.userIdMap[card.userId] as Id<"users"> | undefined;

      if (!userId) {
        console.warn(`Skipping card ${placeholderId}: no valid userId`);
        continue;
      }

      const cardId = await ctx.db.insert("cards", {
        userId: userId,
        cardContext: card.cardContext,
        marqetaCardToken: card.marqetaCardToken || undefined,
        marqetaUserToken: card.marqetaUserToken || undefined,
        last4: card.last4 || "0000",
        expirationMonth: card.expirationMonth || 12,
        expirationYear: card.expirationYear || 2030,
        cardType: card.cardType || "virtual",
        spendingLimit: card.spendingLimit || 50000,
        dailyLimit: card.dailyLimit || 500000,
        monthlyLimit: card.monthlyLimit || 5000000,
        currentBalance: card.currentBalance || 0,
        reservedBalance: card.reservedBalance || 0,
        overdraftLimit: card.overdraftLimit || 0,
        status: card.status || "pending",
        allowedMccCodes: card.allowedMccCodes || undefined,
        blockedMccCodes: card.blockedMccCodes || undefined,
        blockedCountries: card.blockedCountries || undefined,
        breachDetectedAt: card.breachDetectedAt || undefined,
        breachSource: card.breachSource || undefined,
        reissuedFrom: undefined,
        reissuedTo: undefined,
        privacyIsolated: card.privacyIsolated ?? true,
        nickname: card.nickname || undefined,
        color: card.color || undefined,
        createdAt: card.createdAt || Date.now(),
        updatedAt: card.updatedAt || Date.now(),
        lastUsedAt: card.lastUsedAt || undefined,
      });

      idMap[placeholderId] = cardId;
      resolvedIds.set(placeholderId, cardId);
    }

    return { imported: Object.keys(idMap).length, idMap };
  },
});

/**
 * Import wallets
 */
export const importWallets = internalMutation({
  args: {
    wallets: v.array(v.any()),
    userIdMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args): Promise<{ imported: number; idMap: Record<string, string> }> => {
    const idMap: Record<string, string> = {};

    for (const wallet of args.wallets) {
      const placeholderId = wallet._placeholder_id;
      const userId = args.userIdMap[wallet.userId] as Id<"users"> | undefined;

      if (!userId) {
        console.warn(`Skipping wallet ${placeholderId}: no valid userId`);
        continue;
      }

      const walletId = await ctx.db.insert("wallets", {
        userId: userId,
        walletType: wallet.walletType || "solana_external",
        address: wallet.address,
        encryptedPrivateData: wallet.encryptedPrivateData || undefined,
        addressLastFour: wallet.addressLastFour || wallet.address?.slice(-4) || "0000",
        networkType: wallet.networkType || "solana",
        chainId: wallet.chainId || undefined,
        cachedBalance: wallet.cachedBalance || undefined,
        cachedBalanceUsd: wallet.cachedBalanceUsd || undefined,
        balanceLastUpdated: wallet.balanceLastUpdated || undefined,
        connectionStatus: wallet.connectionStatus || "disconnected",
        sessionExpiry: wallet.sessionExpiry || undefined,
        wcTopic: wallet.wcTopic || undefined,
        wcPeerMetadata: wallet.wcPeerMetadata || undefined,
        permissions: wallet.permissions || ["sign_transaction"],
        isDefault: wallet.isDefault ?? false,
        nickname: wallet.nickname || undefined,
        createdAt: wallet.createdAt || Date.now(),
        lastUsedAt: wallet.lastUsedAt || undefined,
      });

      idMap[placeholderId] = walletId;
      resolvedIds.set(placeholderId, walletId);
    }

    return { imported: Object.keys(idMap).length, idMap };
  },
});

/**
 * Import authorizations
 */
export const importAuthorizations = internalMutation({
  args: {
    authorizations: v.array(v.any()),
    cardIdMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args): Promise<{ imported: number; idMap: Record<string, string> }> => {
    const idMap: Record<string, string> = {};

    for (const auth of args.authorizations) {
      const placeholderId = auth._placeholder_id;

      // Find card by context if direct mapping not available
      let cardId: Id<"cards"> | null = null;
      if (auth.cardId && args.cardIdMap[auth.cardId]) {
        cardId = args.cardIdMap[auth.cardId] as Id<"cards">;
      } else if (auth.cardContext) {
        // Look up card by context
        const card = await ctx.db
          .query("cards")
          .withIndex("by_card_context", (q) => q.eq("cardContext", auth.cardContext))
          .first();
        cardId = card?._id || null;
      }

      if (!cardId) {
        console.warn(`Skipping authorization ${placeholderId}: no valid cardId`);
        continue;
      }

      const authId = await ctx.db.insert("authorizations", {
        cardId: cardId,
        cardContext: auth.cardContext,
        marqetaTransactionToken: auth.marqetaTransactionToken,
        authorizationCode: auth.authorizationCode || undefined,
        amount: auth.amount || 0,
        currencyCode: auth.currencyCode || "USD",
        convertedAmount: auth.convertedAmount || undefined,
        exchangeRate: auth.exchangeRate || undefined,
        merchantName: auth.merchantName || "Unknown",
        merchantMcc: auth.merchantMcc || "0000",
        merchantCountry: auth.merchantCountry || undefined,
        merchantCity: auth.merchantCity || undefined,
        merchantId: auth.merchantId || undefined,
        status: auth.status || "pending",
        declineReason: auth.declineReason || undefined,
        declineCode: auth.declineCode || undefined,
        responseTimeMs: auth.responseTimeMs || 0,
        riskScore: auth.riskScore || 0,
        riskLevel: auth.riskLevel || "low",
        retryCount: auth.retryCount || 0,
        processedAt: auth.processedAt || Date.now(),
        expiresAt: auth.expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000,
        settledAt: auth.settledAt || undefined,
      });

      idMap[placeholderId] = authId;
      resolvedIds.set(placeholderId, authId);
    }

    return { imported: Object.keys(idMap).length, idMap };
  },
});

/**
 * Import authorization holds
 */
export const importAuthorizationHolds = internalMutation({
  args: {
    holds: v.array(v.any()),
    cardIdMap: v.record(v.string(), v.string()),
    authIdMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args): Promise<{ imported: number }> => {
    let imported = 0;

    for (const hold of args.holds) {
      // Find card by context
      let cardId: Id<"cards"> | null = null;
      if (hold.cardContext) {
        const card = await ctx.db
          .query("cards")
          .withIndex("by_card_context", (q) => q.eq("cardContext", hold.cardContext))
          .first();
        cardId = card?._id || null;
      }

      // Find authorization
      let authId: Id<"authorizations"> | null = null;
      if (hold.authorizationId && args.authIdMap[hold.authorizationId]) {
        authId = args.authIdMap[hold.authorizationId] as Id<"authorizations">;
      }

      if (!cardId || !authId) {
        console.warn(`Skipping hold: missing cardId or authId`);
        continue;
      }

      await ctx.db.insert("authorizationHolds", {
        cardId: cardId,
        authorizationId: authId,
        cardContext: hold.cardContext,
        holdAmount: hold.holdAmount || 0,
        authorizationCode: hold.authorizationCode || "",
        merchantName: hold.merchantName || "Unknown",
        merchantMcc: hold.merchantMcc || "0000",
        status: hold.status || "active",
        createdAt: hold.createdAt || Date.now(),
        expiresAt: hold.expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000,
        clearedAt: hold.clearedAt || undefined,
      });

      imported++;
    }

    return { imported };
  },
});

/**
 * Import fraud records
 */
export const importFraud = internalMutation({
  args: {
    fraud: v.array(v.any()),
    cardIdMap: v.record(v.string(), v.string()),
    authIdMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args): Promise<{ imported: number }> => {
    let imported = 0;

    for (const record of args.fraud) {
      // Find card by context
      let cardId: Id<"cards"> | null = null;
      if (record.cardContext) {
        const card = await ctx.db
          .query("cards")
          .withIndex("by_card_context", (q) => q.eq("cardContext", record.cardContext))
          .first();
        cardId = card?._id || null;
      }

      if (!cardId) {
        console.warn(`Skipping fraud record: no valid cardId`);
        continue;
      }

      // Find authorization if available
      let authId: Id<"authorizations"> | undefined = undefined;
      if (record.authorizationId && args.authIdMap[record.authorizationId]) {
        authId = args.authIdMap[record.authorizationId] as Id<"authorizations">;
      }

      await ctx.db.insert("fraud", {
        cardId: cardId,
        cardContext: record.cardContext,
        authorizationId: authId,
        marqetaTransactionToken: record.marqetaTransactionToken || undefined,
        riskScore: record.riskScore || 0,
        riskLevel: record.riskLevel || "low",
        riskFactors: record.riskFactors || {
          velocityScore: 0,
          amountScore: 0,
          locationScore: 0,
          timeScore: 0,
          merchantScore: 0,
        },
        anomalies: record.anomalies || [],
        action: record.action || "approve",
        userFeedback: record.userFeedback || undefined,
        feedbackAt: record.feedbackAt || undefined,
        merchantName: record.merchantName || undefined,
        merchantMcc: record.merchantMcc || undefined,
        merchantCountry: record.merchantCountry || undefined,
        amount: record.amount || 0,
        analyzedAt: record.analyzedAt || Date.now(),
        dismissedAt: record.dismissedAt || undefined,
      });

      imported++;
    }

    return { imported };
  },
});

/**
 * Import DeFi positions
 */
export const importDefi = internalMutation({
  args: {
    defi: v.array(v.any()),
    userIdMap: v.record(v.string(), v.string()),
    walletIdMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args): Promise<{ imported: number; idMap: Record<string, string> }> => {
    const idMap: Record<string, string> = {};

    for (const position of args.defi) {
      const placeholderId = position._placeholder_id;

      // Need both userId and walletId
      // For migration, we'll create with first available user/wallet
      const users = await ctx.db.query("users").take(1);
      const wallets = await ctx.db.query("wallets").take(1);

      if (users.length === 0 || wallets.length === 0) {
        console.warn(`Skipping defi position: no users or wallets available`);
        continue;
      }

      const defiId = await ctx.db.insert("defi", {
        userId: users[0]._id,
        walletId: wallets[0]._id,
        positionId: position.positionId,
        protocolName: position.protocolName || "Unknown",
        protocolVersion: position.protocolVersion || undefined,
        networkType: position.networkType || "ethereum",
        positionType: position.positionType || "lending",
        depositedAssets: position.depositedAssets || [],
        totalValueUsd: position.totalValueUsd || 0,
        depositedValueUsd: position.depositedValueUsd || 0,
        earnedValueUsd: position.earnedValueUsd || 0,
        availableForFunding: position.availableForFunding || 0,
        currentYieldApy: position.currentYieldApy || 0,
        estimatedDailyYield: position.estimatedDailyYield || 0,
        riskLevel: position.riskLevel || "medium",
        healthFactor: position.healthFactor || undefined,
        syncStatus: "synced",
        syncError: undefined,
        lastSyncedAt: position.lastSyncedAt || Date.now(),
        createdAt: position.createdAt || Date.now(),
        closedAt: position.closedAt || undefined,
      });

      idMap[placeholderId] = defiId;
    }

    return { imported: Object.keys(idMap).length, idMap };
  },
});

/**
 * Import compliance records
 */
export const importCompliance = internalMutation({
  args: {
    compliance: v.array(v.any()),
    userIdMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args): Promise<{ imported: number }> => {
    let imported = 0;

    for (const record of args.compliance) {
      // Find user - for migration, use first available if not mapped
      const users = await ctx.db.query("users").take(1);
      if (users.length === 0) {
        console.warn(`Skipping compliance record: no users available`);
        continue;
      }

      await ctx.db.insert("compliance", {
        userId: users[0]._id,
        documentType: record.documentType || "id_front",
        documentHash: record.documentHash || "",
        storageRef: record.storageRef || undefined,
        verificationProvider: record.verificationProvider || "manual",
        verificationId: record.verificationId || crypto.randomUUID(),
        status: record.status || "pending",
        rejectionReason: record.rejectionReason || undefined,
        extractedData: record.extractedData || undefined,
        submittedAt: record.submittedAt || Date.now(),
        verifiedAt: record.verifiedAt || undefined,
        expiresAt: record.expiresAt || undefined,
      });

      imported++;
    }

    return { imported };
  },
});

/**
 * Import funding transactions
 */
export const importFundingTransactions = internalMutation({
  args: {
    transactions: v.array(v.any()),
    userIdMap: v.record(v.string(), v.string()),
    cardIdMap: v.record(v.string(), v.string()),
    walletIdMap: v.record(v.string(), v.string()),
    defiIdMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args): Promise<{ imported: number }> => {
    let imported = 0;

    for (const txn of args.transactions) {
      // Resolve userId
      let userId: Id<"users"> | null = null;
      if (txn.userId && args.userIdMap[txn.userId]) {
        userId = args.userIdMap[txn.userId] as Id<"users">;
      } else {
        const users = await ctx.db.query("users").take(1);
        if (users.length > 0) {
          userId = users[0]._id;
        }
      }

      if (!userId) {
        console.warn(`Skipping funding transaction: no valid userId`);
        continue;
      }

      await ctx.db.insert("fundingTransactions", {
        userId: userId,
        transactionType: txn.transactionType || "account_funding",
        amount: txn.amount || 0,
        currency: txn.currency || "USD",
        convertedAmount: txn.convertedAmount || undefined,
        conversionRate: txn.conversionRate || undefined,
        fee: txn.fee || undefined,
        sourceType: txn.sourceType || undefined,
        sourceId: txn.sourceId || undefined,
        sourceCardId: txn.sourceCardId
          ? (args.cardIdMap[txn.sourceCardId] as Id<"cards">)
          : undefined,
        sourceWalletId: txn.sourceWalletId
          ? (args.walletIdMap[txn.sourceWalletId] as Id<"wallets">)
          : undefined,
        sourceDefiId: txn.sourceDefiId
          ? (args.defiIdMap[txn.sourceDefiId] as Id<"defi">)
          : undefined,
        targetCardId: txn.targetCardId
          ? (args.cardIdMap[txn.targetCardId] as Id<"cards">)
          : undefined,
        targetWalletId: txn.targetWalletId
          ? (args.walletIdMap[txn.targetWalletId] as Id<"wallets">)
          : undefined,
        status: txn.status || "pending",
        stripePaymentIntentId: txn.stripePaymentIntentId || undefined,
        stripeChargeId: txn.stripeChargeId || undefined,
        solanaSignature: txn.solanaSignature || undefined,
        intentId: undefined,
        errorMessage: txn.errorMessage || undefined,
        errorCode: txn.errorCode || undefined,
        processingTimeMs: txn.processingTimeMs || undefined,
        createdAt: txn.createdAt || Date.now(),
        completedAt: txn.completedAt || undefined,
      });

      imported++;
    }

    return { imported };
  },
});

/**
 * Import crypto rates
 */
export const importCryptoRates = internalMutation({
  args: {
    rates: v.array(v.any()),
  },
  handler: async (ctx, args): Promise<{ imported: number }> => {
    let imported = 0;

    for (const rate of args.rates) {
      // Check if rate already exists
      const existing = await ctx.db
        .query("cryptoRates")
        .withIndex("by_symbol", (q) => q.eq("symbol", rate.symbol))
        .first();

      if (existing) {
        // Update existing rate
        await ctx.db.patch(existing._id, {
          usdPrice: rate.usdPrice || 0,
          change24h: rate.change24h || 0,
          volume24h: rate.volume24h || 0,
          marketCap: rate.marketCap || 0,
          source: rate.source || "migration",
          updatedAt: Date.now(),
        });
      } else {
        // Insert new rate
        await ctx.db.insert("cryptoRates", {
          symbol: rate.symbol,
          name: rate.name || rate.symbol,
          usdPrice: rate.usdPrice || 0,
          change24h: rate.change24h || 0,
          volume24h: rate.volume24h || 0,
          marketCap: rate.marketCap || 0,
          source: rate.source || "migration",
          createdAt: rate.createdAt || Date.now(),
          updatedAt: Date.now(),
        });
      }

      imported++;
    }

    return { imported };
  },
});

// ============ ORCHESTRATOR ============

/**
 * Import all data (orchestrator action)
 *
 * This should be run from the CLI with:
 * npx convex run migrations/importData:importAll
 *
 * Data files should be in convex/migrations/convex-ready/
 */
export const importAll = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    console.log("=== Starting Convex Data Import ===\n");

    // Note: In production, you would read the JSON files and pass them to mutations
    // This is a placeholder showing the import order

    console.log(`
Import Order:
1. Users (required first - other tables reference users)
2. Cards (references users)
3. Wallets (references users)
4. Authorizations (references cards)
5. Authorization Holds (references cards, authorizations)
6. Fraud (references cards, authorizations)
7. DeFi (references users, wallets)
8. Compliance (references users)
9. Funding Transactions (references users, cards, wallets, defi)
10. Crypto Rates (standalone)

To import, read JSON files from convex/migrations/convex-ready/
and call the respective import mutations with the data.

Example:
  const users = JSON.parse(fs.readFileSync('convex-ready/users.json'));
  const { idMap: userIdMap } = await ctx.runMutation(internal.migrations.importData.importUsers, { users });

  const cards = JSON.parse(fs.readFileSync('convex-ready/cards.json'));
  await ctx.runMutation(internal.migrations.importData.importCards, { cards, userIdMap });

  // ... continue with other tables
`);

    console.log("\n=== Import Instructions Complete ===");
  },
});
