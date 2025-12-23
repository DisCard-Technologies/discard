/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth_passkeys from "../auth/passkeys.js";
import type * as auth_sessions from "../auth/sessions.js";
import type * as cards_cards from "../cards/cards.js";
import type * as cards_marqeta from "../cards/marqeta.js";
import type * as crons from "../crons.js";
import type * as crons_cleanupMetrics from "../crons/cleanupMetrics.js";
import type * as crons_cleanupSessions from "../crons/cleanupSessions.js";
import type * as crons_expireHolds from "../crons/expireHolds.js";
import type * as crons_selfHealingCheck from "../crons/selfHealingCheck.js";
import type * as crons_syncDefi from "../crons/syncDefi.js";
import type * as crons_syncRates from "../crons/syncRates.js";
import type * as fraud_detection from "../fraud/detection.js";
import type * as funding_funding from "../funding/funding.js";
import type * as funding_iban from "../funding/iban.js";
import type * as funding_moonpay from "../funding/moonpay.js";
import type * as funding_stripe from "../funding/stripe.js";
import type * as http from "../http.js";
import type * as http_webhooks from "../http/webhooks.js";
import type * as intents_executor from "../intents/executor.js";
import type * as intents_intents from "../intents/intents.js";
import type * as intents_solver from "../intents/solver.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "auth/passkeys": typeof auth_passkeys;
  "auth/sessions": typeof auth_sessions;
  "cards/cards": typeof cards_cards;
  "cards/marqeta": typeof cards_marqeta;
  crons: typeof crons;
  "crons/cleanupMetrics": typeof crons_cleanupMetrics;
  "crons/cleanupSessions": typeof crons_cleanupSessions;
  "crons/expireHolds": typeof crons_expireHolds;
  "crons/selfHealingCheck": typeof crons_selfHealingCheck;
  "crons/syncDefi": typeof crons_syncDefi;
  "crons/syncRates": typeof crons_syncRates;
  "fraud/detection": typeof fraud_detection;
  "funding/funding": typeof funding_funding;
  "funding/iban": typeof funding_iban;
  "funding/moonpay": typeof funding_moonpay;
  "funding/stripe": typeof funding_stripe;
  http: typeof http;
  "http/webhooks": typeof http_webhooks;
  "intents/executor": typeof intents_executor;
  "intents/intents": typeof intents_intents;
  "intents/solver": typeof intents_solver;
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
