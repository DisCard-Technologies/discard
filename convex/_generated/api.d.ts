/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attestations_sas from "../attestations/sas.js";
import type * as auth_passkeys from "../auth/passkeys.js";
import type * as auth_sessions from "../auth/sessions.js";
import type * as bridge_financialArmorClient from "../bridge/financialArmorClient.js";
import type * as bridge_settlement from "../bridge/settlement.js";
import type * as bridge_turnkeyBridge from "../bridge/turnkeyBridge.js";
import type * as cards_cards from "../cards/cards.js";
import type * as cards_marqeta from "../cards/marqeta.js";
import type * as compression_light from "../compression/light.js";
import type * as compression_proofs from "../compression/proofs.js";
import type * as crons from "../crons.js";
import type * as crons_cleanupMetrics from "../crons/cleanupMetrics.js";
import type * as crons_cleanupSessions from "../crons/cleanupSessions.js";
import type * as crons_expireHolds from "../crons/expireHolds.js";
import type * as crons_selfHealingCheck from "../crons/selfHealingCheck.js";
import type * as crons_syncDefi from "../crons/syncDefi.js";
import type * as crons_syncRates from "../crons/syncRates.js";
import type * as explore_trending from "../explore/trending.js";
import type * as fraud_detection from "../fraud/detection.js";
import type * as funding_funding from "../funding/funding.js";
import type * as funding_iban from "../funding/iban.js";
import type * as funding_moonpay from "../funding/moonpay.js";
import type * as funding_stripe from "../funding/stripe.js";
import type * as holdings_dflow from "../holdings/dflow.js";
import type * as holdings_jupiter from "../holdings/jupiter.js";
import type * as hooks_merchants from "../hooks/merchants.js";
import type * as hooks_policies from "../hooks/policies.js";
import type * as http from "../http.js";
import type * as http_webhooks from "../http/webhooks.js";
import type * as identity_did from "../identity/did.js";
import type * as intents_executor from "../intents/executor.js";
import type * as intents_intents from "../intents/intents.js";
import type * as intents_solver from "../intents/solver.js";
import type * as realtime_optimistic from "../realtime/optimistic.js";
import type * as scripts_bulkCreateCards from "../scripts/bulkCreateCards.js";
import type * as scripts_migrateEthereumWallets from "../scripts/migrateEthereumWallets.js";
import type * as scripts_reprovisionCards from "../scripts/reprovisionCards.js";
import type * as tee_turnkey from "../tee/turnkey.js";
import type * as transfers_contacts from "../transfers/contacts.js";
import type * as transfers_paymentRequests from "../transfers/paymentRequests.js";
import type * as transfers_transfers from "../transfers/transfers.js";
import type * as wallets_defi from "../wallets/defi.js";
import type * as wallets_network from "../wallets/network.js";
import type * as wallets_quotes from "../wallets/quotes.js";
import type * as wallets_rates from "../wallets/rates.js";
import type * as wallets_wallets from "../wallets/wallets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "attestations/sas": typeof attestations_sas;
  "auth/passkeys": typeof auth_passkeys;
  "auth/sessions": typeof auth_sessions;
  "bridge/financialArmorClient": typeof bridge_financialArmorClient;
  "bridge/settlement": typeof bridge_settlement;
  "bridge/turnkeyBridge": typeof bridge_turnkeyBridge;
  "cards/cards": typeof cards_cards;
  "cards/marqeta": typeof cards_marqeta;
  "compression/light": typeof compression_light;
  "compression/proofs": typeof compression_proofs;
  crons: typeof crons;
  "crons/cleanupMetrics": typeof crons_cleanupMetrics;
  "crons/cleanupSessions": typeof crons_cleanupSessions;
  "crons/expireHolds": typeof crons_expireHolds;
  "crons/selfHealingCheck": typeof crons_selfHealingCheck;
  "crons/syncDefi": typeof crons_syncDefi;
  "crons/syncRates": typeof crons_syncRates;
  "explore/trending": typeof explore_trending;
  "fraud/detection": typeof fraud_detection;
  "funding/funding": typeof funding_funding;
  "funding/iban": typeof funding_iban;
  "funding/moonpay": typeof funding_moonpay;
  "funding/stripe": typeof funding_stripe;
  "holdings/dflow": typeof holdings_dflow;
  "holdings/jupiter": typeof holdings_jupiter;
  "hooks/merchants": typeof hooks_merchants;
  "hooks/policies": typeof hooks_policies;
  http: typeof http;
  "http/webhooks": typeof http_webhooks;
  "identity/did": typeof identity_did;
  "intents/executor": typeof intents_executor;
  "intents/intents": typeof intents_intents;
  "intents/solver": typeof intents_solver;
  "realtime/optimistic": typeof realtime_optimistic;
  "scripts/bulkCreateCards": typeof scripts_bulkCreateCards;
  "scripts/migrateEthereumWallets": typeof scripts_migrateEthereumWallets;
  "scripts/reprovisionCards": typeof scripts_reprovisionCards;
  "tee/turnkey": typeof tee_turnkey;
  "transfers/contacts": typeof transfers_contacts;
  "transfers/paymentRequests": typeof transfers_paymentRequests;
  "transfers/transfers": typeof transfers_transfers;
  "wallets/defi": typeof wallets_defi;
  "wallets/network": typeof wallets_network;
  "wallets/quotes": typeof wallets_quotes;
  "wallets/rates": typeof wallets_rates;
  "wallets/wallets": typeof wallets_wallets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
