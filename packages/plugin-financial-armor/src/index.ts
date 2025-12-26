/**
 * DisCard Financial Armor Plugin
 *
 * elizaOS plugin for TEE-based intent verification and Turnkey bridging.
 * Implements the "Soul" layer in the Brain-Soul architecture.
 *
 * "The Brain proposes, the Soul disposes."
 */

import { Connection } from "@solana/web3.js";
import type { Plugin, IAgentRuntime } from "@elizaos/core";
import { MerchantValidator } from "./services/merchantValidator.js";
import { VelocityChecker } from "./services/velocityChecker.js";
import { AttestationProvider } from "./services/attestationProvider.js";
import { TurnkeyBridge } from "./services/turnkeyBridge.js";
import { IntentVerifier } from "./services/intentVerifier.js";
import { FinancialArmorGrpcServer } from "./grpc/server.js";
import type {
  FinancialArmorConfig,
  FinancialArmorState,
  PluginMetrics,
} from "./types/index.js";
import { DEFAULT_CONFIG } from "./types/index.js";

// Re-export types
export * from "./types/index.js";

// Re-export services
export { MerchantValidator } from "./services/merchantValidator.js";
export { VelocityChecker } from "./services/velocityChecker.js";
export { AttestationProvider } from "./services/attestationProvider.js";
export { TurnkeyBridge } from "./services/turnkeyBridge.js";
export { IntentVerifier } from "./services/intentVerifier.js";
export { FinancialArmorGrpcServer } from "./grpc/server.js";

/**
 * Plugin state stored in runtime
 */
let pluginState: FinancialArmorState | null = null;
let grpcServer: FinancialArmorGrpcServer | null = null;
let services: {
  merchantValidator: MerchantValidator;
  velocityChecker: VelocityChecker;
  attestationProvider: AttestationProvider;
  turnkeyBridge: TurnkeyBridge;
  intentVerifier: IntentVerifier;
} | null = null;

/**
 * Initialize the Financial Armor plugin
 */
async function initialize(
  runtime: IAgentRuntime,
  config: FinancialArmorConfig
): Promise<void> {
  console.log("[Financial Armor] Initializing plugin...");

  // Merge with defaults
  const finalConfig = { ...DEFAULT_CONFIG, ...config } as FinancialArmorConfig;

  // Initialize Solana connection
  const connection = new Connection(
    finalConfig.heliusRpcUrl ?? finalConfig.solanaRpcUrl,
    "confirmed"
  );

  // Initialize services
  const merchantValidator = new MerchantValidator(connection);

  const velocityChecker = new VelocityChecker(
    finalConfig.solanaRpcUrl,
    finalConfig.compressionRpcUrl
  );

  const attestationProvider = new AttestationProvider({
    attestationEndpoint: finalConfig.attestationEndpoint,
    autoRefresh: true,
  });

  const turnkeyBridge = new TurnkeyBridge({
    apiBaseUrl: finalConfig.turnkeyApiBaseUrl ?? "https://api.turnkey.com",
    organizationId: finalConfig.turnkeyOrganizationId,
    stamper: attestationProvider,
  });

  const intentVerifier = new IntentVerifier(
    merchantValidator,
    velocityChecker,
    attestationProvider,
    { debug: finalConfig.logLevel === "debug" }
  );

  // Store services
  services = {
    merchantValidator,
    velocityChecker,
    attestationProvider,
    turnkeyBridge,
    intentVerifier,
  };

  // Initialize gRPC server
  grpcServer = new FinancialArmorGrpcServer({
    port: finalConfig.grpcPort,
    intentVerifier,
    merchantValidator,
    velocityChecker,
    attestationProvider,
  });

  await grpcServer.start();

  // Initialize plugin state
  pluginState = {
    initialized: true,
    activeRequests: new Map(),
    recentResults: new Map(),
    metrics: {
      totalVerifications: 0,
      approvedCount: 0,
      deniedCount: 0,
      avgVerificationTimeMs: 0,
      merchantValidations: 0,
      velocityChecks: 0,
      attestationRefreshes: 0,
      errorCount: 0,
    },
  };

  console.log(
    `[Financial Armor] Plugin initialized. gRPC server on port ${finalConfig.grpcPort}`
  );
}

/**
 * Shutdown the plugin
 */
async function shutdown(): Promise<void> {
  console.log("[Financial Armor] Shutting down...");

  if (grpcServer) {
    await grpcServer.stop();
    grpcServer = null;
  }

  if (services) {
    services.attestationProvider.destroy();
    services = null;
  }

  pluginState = null;

  console.log("[Financial Armor] Shutdown complete.");
}

/**
 * Get plugin services (for external access)
 */
export function getServices(): typeof services {
  return services;
}

/**
 * Get plugin state
 */
export function getState(): FinancialArmorState | null {
  return pluginState;
}

/**
 * Get plugin metrics
 */
export function getMetrics(): PluginMetrics | null {
  if (grpcServer) {
    return grpcServer.getMetrics();
  }
  return pluginState?.metrics ?? null;
}

/**
 * Financial Armor Plugin Definition
 */
export const financialArmorPlugin: Plugin = {
  name: "@discard/plugin-financial-armor",
  description:
    "TEE-based intent verification and Turnkey bridging for DisCard Financial OS",

  // Plugin actions (elizaOS action handlers)
  actions: [
    {
      name: "VERIFY_INTENT",
      description: "Verify a financial intent from the orchestrator",
      similes: ["check intent", "validate transaction", "approve intent"],
      examples: [
        [
          {
            user: "orchestrator",
            content: {
              text: "Verify intent to fund card with $50",
            },
          },
          {
            user: "alex_sovereign",
            content: {
              text: "Intent verified. Attestation: abc123...",
            },
          },
        ],
      ],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!services) {
          callback?.({
            text: "Financial Armor not initialized",
            error: true,
          });
          return false;
        }

        try {
          // Extract intent from message
          const intent = message.content as Record<string, unknown>;

          const result = await services.intentVerifier.verify(
            {
              requestId: `msg_${Date.now()}`,
              intentId: intent.intentId as string ?? `intent_${Date.now()}`,
              action: intent.action as "fund_card",
              amount: Number(intent.amount ?? 0),
              sourceType: (intent.sourceType as "wallet") ?? "wallet",
              targetType: (intent.targetType as "card") ?? "card",
              timestamp: Date.now(),
            },
            {
              userId: message.userId,
              walletAddress: intent.walletAddress as string ?? "",
              subOrganizationId: intent.subOrganizationId as string ?? "",
              policies: {
                merchantLocking: false,
                velocityLimits: {
                  perTransaction: 10000000,
                  daily: 50000000,
                  weekly: 200000000,
                  monthly: 500000000,
                },
                requireBiometric: false,
                requireFraudClearance: false,
                require2FA: false,
              },
            }
          );

          callback?.({
            text: result.approved
              ? `Intent verified. Attestation: ${result.attestationQuote.slice(0, 32)}...`
              : `Intent denied: ${result.denialReason}`,
            data: result,
          });

          return result.approved;
        } catch (error) {
          callback?.({
            text: `Verification error: ${error instanceof Error ? error.message : "Unknown"}`,
            error: true,
          });
          return false;
        }
      },
    },
    {
      name: "CHECK_MERCHANT",
      description: "Check if a merchant is registered and valid",
      similes: ["validate merchant", "check vendor"],
      examples: [],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!services) {
          callback?.({ text: "Not initialized", error: true });
          return false;
        }

        const content = message.content as Record<string, unknown>;
        const result = await services.merchantValidator.validate(
          content.merchantId as string,
          content.mccCode as string,
          {
            merchantLocking: false,
            velocityLimits: {
              perTransaction: 0,
              daily: 0,
              weekly: 0,
              monthly: 0,
            },
            requireBiometric: false,
            requireFraudClearance: false,
            require2FA: false,
          }
        );

        callback?.({
          text: result.isValid
            ? `Merchant valid (risk tier ${result.riskTier})`
            : `Merchant invalid: ${result.reason}`,
          data: result,
        });

        return result.isValid;
      },
    },
    {
      name: "CHECK_VELOCITY",
      description: "Check if a transaction is within velocity limits",
      similes: ["check spending limit", "verify limit"],
      examples: [],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!services) {
          callback?.({ text: "Not initialized", error: true });
          return false;
        }

        const content = message.content as Record<string, unknown>;
        const result = await services.velocityChecker.check(
          content.userId as string,
          content.cardId as string ?? "",
          Number(content.amount ?? 0),
          {
            perTransaction: Number(content.perTxLimit ?? 10000000),
            daily: Number(content.dailyLimit ?? 50000000),
            weekly: Number(content.weeklyLimit ?? 200000000),
            monthly: Number(content.monthlyLimit ?? 500000000),
          }
        );

        callback?.({
          text: result.withinLimits
            ? "Within velocity limits"
            : `Velocity exceeded: ${result.denialReason}`,
          data: result,
        });

        return result.withinLimits;
      },
    },
    {
      name: "GET_ATTESTATION",
      description: "Get current TEE attestation quote",
      similes: ["get attestation", "get proof"],
      examples: [],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!services) {
          callback?.({ text: "Not initialized", error: true });
          return false;
        }

        const quote = await services.attestationProvider.getQuote();

        callback?.({
          text: `Attestation valid until ${new Date(quote.expiresAt).toISOString()}`,
          data: {
            publicKey: quote.publicKey,
            mrEnclave: quote.mrEnclave,
            expiresAt: quote.expiresAt,
          },
        });

        return true;
      },
    },
  ],

  // Plugin evaluators
  evaluators: [],

  // Plugin providers
  providers: [],

  // Plugin services (background services)
  services: [
    {
      name: "financial-armor-grpc",
      description: "gRPC server for orchestrator communication",
      serviceType: "GRPC_SERVER" as const,
      initialize: async (runtime: IAgentRuntime) => {
        // Get config from runtime settings
        const config: FinancialArmorConfig = {
          solanaRpcUrl:
            runtime.getSetting("SOLANA_RPC_URL") ??
            "https://api.mainnet-beta.solana.com",
          heliusRpcUrl: runtime.getSetting("HELIUS_RPC_URL"),
          compressionRpcUrl: runtime.getSetting("COMPRESSION_RPC_URL"),
          turnkeyOrganizationId:
            runtime.getSetting("TURNKEY_ORGANIZATION_ID") ?? "",
          turnkeyApiBaseUrl: runtime.getSetting("TURNKEY_API_BASE_URL"),
          grpcPort: Number(runtime.getSetting("GRPC_PORT") ?? 50051),
          attestationEndpoint: runtime.getSetting("ATTESTATION_ENDPOINT"),
          logLevel: (runtime.getSetting("LOG_LEVEL") ?? "info") as "info",
          metricsEnabled:
            runtime.getSetting("METRICS_ENABLED") !== "false",
        };

        await initialize(runtime, config);
      },
      stop: async () => {
        await shutdown();
      },
    },
  ],
};

// Default export
export default financialArmorPlugin;
