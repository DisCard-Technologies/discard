/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents_agents from "../agents/agents.js";
import type * as approvals_approvals from "../approvals/approvals.js";
import type * as approvals_multiSig from "../approvals/multiSig.js";
import type * as approvals_plans from "../approvals/plans.js";
import type * as approvals_policies from "../approvals/policies.js";
import type * as approvals_roles from "../approvals/roles.js";
import type * as approvals_safetyFlow from "../approvals/safetyFlow.js";
import type * as attestations_sas from "../attestations/sas.js";
import type * as audit_anchorSolana from "../audit/anchorSolana.js";
import type * as audit_auditLog from "../audit/auditLog.js";
import type * as auth_passkeys from "../auth/passkeys.js";
import type * as auth_phoneVerification from "../auth/phoneVerification.js";
import type * as auth_sessions from "../auth/sessions.js";
import type * as backup_backups from "../backup/backups.js";
import type * as bridge_financialArmorClient from "../bridge/financialArmorClient.js";
import type * as bridge_settlement from "../bridge/settlement.js";
import type * as bridge_turnkeyBridge from "../bridge/turnkeyBridge.js";
import type * as cards_cardFunding from "../cards/cardFunding.js";
import type * as cards_cards from "../cards/cards.js";
import type * as cards_marqeta from "../cards/marqeta.js";
import type * as cards_starpay from "../cards/starpay.js";
import type * as circuitBreakers_circuitBreakers from "../circuitBreakers/circuitBreakers.js";
import type * as compliance_proofArchive from "../compliance/proofArchive.js";
import type * as compression_light from "../compression/light.js";
import type * as compression_proofs from "../compression/proofs.js";
import type * as crons from "../crons.js";
import type * as crons_anchorAuditBatch from "../crons/anchorAuditBatch.js";
import type * as crons_cleanupMetrics from "../crons/cleanupMetrics.js";
import type * as crons_cleanupSessions from "../crons/cleanupSessions.js";
import type * as crons_expireHolds from "../crons/expireHolds.js";
import type * as crons_selfHealingCheck from "../crons/selfHealingCheck.js";
import type * as crons_syncDefi from "../crons/syncDefi.js";
import type * as crons_syncHistoricalPrices from "../crons/syncHistoricalPrices.js";
import type * as crons_syncRates from "../crons/syncRates.js";
import type * as explore_birdeye from "../explore/birdeye.js";
import type * as explore_tokenDetail from "../explore/tokenDetail.js";
import type * as explore_trending from "../explore/trending.js";
import type * as fraud_detection from "../fraud/detection.js";
import type * as funding_funding from "../funding/funding.js";
import type * as funding_iban from "../funding/iban.js";
import type * as funding_moonpay from "../funding/moonpay.js";
import type * as funding_stripe from "../funding/stripe.js";
import type * as goals_goals from "../goals/goals.js";
import type * as holdings_dflow from "../holdings/dflow.js";
import type * as holdings_jupiter from "../holdings/jupiter.js";
import type * as holdings_transactionHistory from "../holdings/transactionHistory.js";
import type * as hooks_merchants from "../hooks/merchants.js";
import type * as hooks_policies from "../hooks/policies.js";
import type * as http from "../http.js";
import type * as http_webhooks from "../http/webhooks.js";
import type * as identity_did from "../identity/did.js";
import type * as intents_cache from "../intents/cache.js";
import type * as intents_classifier from "../intents/classifier.js";
import type * as intents_executor from "../intents/executor.js";
import type * as intents_handlers_actionHandler from "../intents/handlers/actionHandler.js";
import type * as intents_handlers_conversationHandler from "../intents/handlers/conversationHandler.js";
import type * as intents_handlers_questionHandler from "../intents/handlers/questionHandler.js";
import type * as intents_intents from "../intents/intents.js";
import type * as intents_rateLimiter from "../intents/rateLimiter.js";
import type * as intents_solver from "../intents/solver.js";
import type * as lib_differentialPrivacy from "../lib/differentialPrivacy.js";
import type * as network_privateRpc from "../network/privateRpc.js";
import type * as network_timingService from "../network/timingService.js";
import type * as notifications_send from "../notifications/send.js";
import type * as notifications_tokens from "../notifications/tokens.js";
import type * as nullifiers from "../nullifiers.js";
import type * as privacy from "../privacy.js";
import type * as privacy_incoSpending from "../privacy/incoSpending.js";
import type * as privacy_keyImages from "../privacy/keyImages.js";
import type * as privacy_nullifiers from "../privacy/nullifiers.js";
import type * as privacy_stealthAddresses from "../privacy/stealthAddresses.js";
import type * as privacy_teeCompliance from "../privacy/teeCompliance.js";
import type * as privacy_umbra from "../privacy/umbra.js";
import type * as privacy_zkProofs from "../privacy/zkProofs.js";
import type * as realtime_optimistic from "../realtime/optimistic.js";
import type * as scripts_bulkCreateCards from "../scripts/bulkCreateCards.js";
import type * as scripts_migrateEthereumWallets from "../scripts/migrateEthereumWallets.js";
import type * as scripts_reprovisionCards from "../scripts/reprovisionCards.js";
import type * as shadowwire_privateTransferNotes from "../shadowwire/privateTransferNotes.js";
import type * as shadowwire_relay from "../shadowwire/relay.js";
import type * as tee_magicblock from "../tee/magicblock.js";
import type * as tee_turnkey from "../tee/turnkey.js";
import type * as tee_turnkeyConsensus from "../tee/turnkeyConsensus.js";
import type * as transfers_contacts from "../transfers/contacts.js";
import type * as transfers_crossCurrency from "../transfers/crossCurrency.js";
import type * as transfers_invitations from "../transfers/invitations.js";
import type * as transfers_lookup from "../transfers/lookup.js";
import type * as transfers_merchantPayment from "../transfers/merchantPayment.js";
import type * as transfers_oneTimePayments from "../transfers/oneTimePayments.js";
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
  "agents/agents": typeof agents_agents;
  "approvals/approvals": typeof approvals_approvals;
  "approvals/multiSig": typeof approvals_multiSig;
  "approvals/plans": typeof approvals_plans;
  "approvals/policies": typeof approvals_policies;
  "approvals/roles": typeof approvals_roles;
  "approvals/safetyFlow": typeof approvals_safetyFlow;
  "attestations/sas": typeof attestations_sas;
  "audit/anchorSolana": typeof audit_anchorSolana;
  "audit/auditLog": typeof audit_auditLog;
  "auth/passkeys": typeof auth_passkeys;
  "auth/phoneVerification": typeof auth_phoneVerification;
  "auth/sessions": typeof auth_sessions;
  "backup/backups": typeof backup_backups;
  "bridge/financialArmorClient": typeof bridge_financialArmorClient;
  "bridge/settlement": typeof bridge_settlement;
  "bridge/turnkeyBridge": typeof bridge_turnkeyBridge;
  "cards/cardFunding": typeof cards_cardFunding;
  "cards/cards": typeof cards_cards;
  "cards/marqeta": typeof cards_marqeta;
  "cards/starpay": typeof cards_starpay;
  "circuitBreakers/circuitBreakers": typeof circuitBreakers_circuitBreakers;
  "compliance/proofArchive": typeof compliance_proofArchive;
  "compression/light": typeof compression_light;
  "compression/proofs": typeof compression_proofs;
  crons: typeof crons;
  "crons/anchorAuditBatch": typeof crons_anchorAuditBatch;
  "crons/cleanupMetrics": typeof crons_cleanupMetrics;
  "crons/cleanupSessions": typeof crons_cleanupSessions;
  "crons/expireHolds": typeof crons_expireHolds;
  "crons/selfHealingCheck": typeof crons_selfHealingCheck;
  "crons/syncDefi": typeof crons_syncDefi;
  "crons/syncHistoricalPrices": typeof crons_syncHistoricalPrices;
  "crons/syncRates": typeof crons_syncRates;
  "explore/birdeye": typeof explore_birdeye;
  "explore/tokenDetail": typeof explore_tokenDetail;
  "explore/trending": typeof explore_trending;
  "fraud/detection": typeof fraud_detection;
  "funding/funding": typeof funding_funding;
  "funding/iban": typeof funding_iban;
  "funding/moonpay": typeof funding_moonpay;
  "funding/stripe": typeof funding_stripe;
  "goals/goals": typeof goals_goals;
  "holdings/dflow": typeof holdings_dflow;
  "holdings/jupiter": typeof holdings_jupiter;
  "holdings/transactionHistory": typeof holdings_transactionHistory;
  "hooks/merchants": typeof hooks_merchants;
  "hooks/policies": typeof hooks_policies;
  http: typeof http;
  "http/webhooks": typeof http_webhooks;
  "identity/did": typeof identity_did;
  "intents/cache": typeof intents_cache;
  "intents/classifier": typeof intents_classifier;
  "intents/executor": typeof intents_executor;
  "intents/handlers/actionHandler": typeof intents_handlers_actionHandler;
  "intents/handlers/conversationHandler": typeof intents_handlers_conversationHandler;
  "intents/handlers/questionHandler": typeof intents_handlers_questionHandler;
  "intents/intents": typeof intents_intents;
  "intents/rateLimiter": typeof intents_rateLimiter;
  "intents/solver": typeof intents_solver;
  "lib/differentialPrivacy": typeof lib_differentialPrivacy;
  "network/privateRpc": typeof network_privateRpc;
  "network/timingService": typeof network_timingService;
  "notifications/send": typeof notifications_send;
  "notifications/tokens": typeof notifications_tokens;
  nullifiers: typeof nullifiers;
  privacy: typeof privacy;
  "privacy/incoSpending": typeof privacy_incoSpending;
  "privacy/keyImages": typeof privacy_keyImages;
  "privacy/nullifiers": typeof privacy_nullifiers;
  "privacy/stealthAddresses": typeof privacy_stealthAddresses;
  "privacy/teeCompliance": typeof privacy_teeCompliance;
  "privacy/umbra": typeof privacy_umbra;
  "privacy/zkProofs": typeof privacy_zkProofs;
  "realtime/optimistic": typeof realtime_optimistic;
  "scripts/bulkCreateCards": typeof scripts_bulkCreateCards;
  "scripts/migrateEthereumWallets": typeof scripts_migrateEthereumWallets;
  "scripts/reprovisionCards": typeof scripts_reprovisionCards;
  "shadowwire/privateTransferNotes": typeof shadowwire_privateTransferNotes;
  "shadowwire/relay": typeof shadowwire_relay;
  "tee/magicblock": typeof tee_magicblock;
  "tee/turnkey": typeof tee_turnkey;
  "tee/turnkeyConsensus": typeof tee_turnkeyConsensus;
  "transfers/contacts": typeof transfers_contacts;
  "transfers/crossCurrency": typeof transfers_crossCurrency;
  "transfers/invitations": typeof transfers_invitations;
  "transfers/lookup": typeof transfers_lookup;
  "transfers/merchantPayment": typeof transfers_merchantPayment;
  "transfers/oneTimePayments": typeof transfers_oneTimePayments;
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
