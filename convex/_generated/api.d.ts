/* eslint-disable */
/**
 * Generated API types.
 * 
 * THIS IS A STUB FILE - Run `npx convex dev` to generate the real version.
 */

import type { FunctionReference } from "convex/server";

// Stub API type - provides autocomplete structure
export declare const api: {
  auth: {
    passkeys: {
      me: FunctionReference<"query", "public", {}, any>;
      getUser: FunctionReference<"query", "public", { userId: string }, any>;
      isCredentialRegistered: FunctionReference<"query", "public", { credentialId: string }, boolean>;
      getUserBySolanaAddress: FunctionReference<"query", "public", { solanaAddress: string }, any>;
      getUserByPhoneHash: FunctionReference<"query", "public", { phoneHash: string }, any>;
      registerPasskey: FunctionReference<"mutation", "public", any, any>;
      verifyPasskey: FunctionReference<"mutation", "public", any, any>;
      updateProfile: FunctionReference<"mutation", "public", any, void>;
      updatePrivacySettings: FunctionReference<"mutation", "public", any, void>;
      linkPhoneHash: FunctionReference<"mutation", "public", { phoneHash: string }, void>;
      addPasskeyCredential: FunctionReference<"mutation", "public", any, void>;
    };
    sessions: {
      isSessionValid: FunctionReference<"query", "public", {}, boolean>;
      getCurrentSession: FunctionReference<"query", "public", {}, any>;
      heartbeat: FunctionReference<"mutation", "public", {}, void>;
      logout: FunctionReference<"mutation", "public", any, void>;
      forceLogoutAllSessions: FunctionReference<"mutation", "public", {}, void>;
    };
  };
  cards: {
    cards: any;
    marqeta: any;
  };
  wallets: any;
  intents: {
    intents: any;
    executor: any;
    solver: any;
  };
  fraud: {
    detection: any;
  };
  funding: {
    funding: any;
    stripe: any;
    moonpay: any;
    iban: any;
  };
};

export declare const internal: {
  auth: {
    passkeys: {
      updateKycStatus: FunctionReference<"mutation", "internal", any, void>;
      updateRiskScore: FunctionReference<"mutation", "internal", any, void>;
      updateAccountStatus: FunctionReference<"mutation", "internal", any, void>;
    };
    sessions: {
      recordLoginEvent: FunctionReference<"mutation", "internal", any, void>;
      forceDisconnectUser: FunctionReference<"mutation", "internal", any, void>;
    };
  };
  crons: any;
};

