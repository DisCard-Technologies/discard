/**
 * DisCard Brain Orchestrator Plugin
 *
 * elizaOS plugin for TEE-based intent parsing, planning, and orchestration.
 * Implements the "Brain" layer in the Brain-Soul architecture.
 *
 * "The Brain proposes, the Soul disposes."
 */

import type { Plugin, IAgentRuntime } from "@elizaos/core";
import { IntentParser } from "./services/intentParser.js";
import { ContextManager } from "./services/contextManager.js";
import { PlanningEngine } from "./services/planningEngine.js";
import { ToolOrchestrator } from "./services/toolOrchestrator.js";
import { SoulClient } from "./services/soulClient.js";
import { SoulVerifier } from "./attestation/soulVerifier.js";
import { BrainGrpcServer } from "./grpc/server.js";

// Re-export types
export * from "./types/index.js";

// Re-export services
export { IntentParser } from "./services/intentParser.js";
export { ContextManager } from "./services/contextManager.js";
export { PlanningEngine } from "./services/planningEngine.js";
export { ToolOrchestrator } from "./services/toolOrchestrator.js";
export { SoulClient } from "./services/soulClient.js";
export { SoulVerifier } from "./attestation/soulVerifier.js";
export { BrainGrpcServer } from "./grpc/server.js";

/**
 * Plugin configuration
 */
export interface BrainOrchestratorConfig {
  soulGrpcUrl: string;
  grpcPort: number;
  contextTtlSeconds: number;
  maxContextTurns: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BrainOrchestratorConfig = {
  soulGrpcUrl: "localhost:50051",
  grpcPort: 50052,
  contextTtlSeconds: 3600,
  maxContextTurns: 50,
  logLevel: "info",
};

/**
 * Plugin state
 */
interface BrainOrchestratorState {
  initialized: boolean;
  metrics: {
    totalRequests: number;
    intentsParsed: number;
    plansExecuted: number;
    soulVerifications: number;
    errorCount: number;
  };
}

/**
 * Plugin services
 */
let services: {
  intentParser: IntentParser;
  contextManager: ContextManager;
  planningEngine: PlanningEngine;
  toolOrchestrator: ToolOrchestrator;
  soulClient: SoulClient;
  soulVerifier: SoulVerifier;
} | null = null;

let grpcServer: BrainGrpcServer | null = null;
let pluginState: BrainOrchestratorState | null = null;

/**
 * Initialize the Brain Orchestrator plugin
 */
async function initialize(
  runtime: IAgentRuntime,
  config: BrainOrchestratorConfig
): Promise<void> {
  console.log("[Brain Orchestrator] Initializing plugin...");

  // Merge with defaults
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Initialize Soul client
  const soulClient = new SoulClient({
    soulGrpcUrl: finalConfig.soulGrpcUrl,
    timeoutMs: 5000,
  });

  // Initialize Soul verifier
  const soulVerifier = new SoulVerifier(soulClient, {
    attestationCacheTtlMs: 50000,
    verifyOnEveryRequest: false,
    strictMode: false,
  });

  // Initialize services
  const intentParser = new IntentParser({
    confidenceThreshold: 0.7,
    clarificationThreshold: 0.5,
  });

  const contextManager = new ContextManager({
    maxTurns: finalConfig.maxContextTurns,
    ttlSeconds: finalConfig.contextTtlSeconds,
    persistUserState: true,
  });

  const planningEngine = new PlanningEngine(soulClient, {
    maxStepsPerPlan: 10,
    defaultTimeoutMs: 30000,
    requireApprovalByDefault: true,
  });

  const toolOrchestrator = new ToolOrchestrator(soulClient, soulVerifier, {
    timeoutMs: 10000,
    maxConcurrentCalls: 5,
  });

  // Store services
  services = {
    intentParser,
    contextManager,
    planningEngine,
    toolOrchestrator,
    soulClient,
    soulVerifier,
  };

  // Initialize gRPC server
  grpcServer = new BrainGrpcServer(
    intentParser,
    contextManager,
    planningEngine,
    toolOrchestrator,
    soulVerifier,
    { port: finalConfig.grpcPort }
  );

  await grpcServer.start();

  // Try to connect to Soul
  try {
    await soulClient.connect();
    console.log("[Brain Orchestrator] Connected to Soul CVM");
  } catch (error) {
    console.warn(
      "[Brain Orchestrator] Could not connect to Soul CVM:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  // Initialize state
  pluginState = {
    initialized: true,
    metrics: {
      totalRequests: 0,
      intentsParsed: 0,
      plansExecuted: 0,
      soulVerifications: 0,
      errorCount: 0,
    },
  };

  console.log(
    `[Brain Orchestrator] Plugin initialized. gRPC server on port ${finalConfig.grpcPort}`
  );
}

/**
 * Shutdown the plugin
 */
async function shutdown(): Promise<void> {
  console.log("[Brain Orchestrator] Shutting down...");

  if (grpcServer) {
    await grpcServer.stop();
    grpcServer = null;
  }

  if (services) {
    services.contextManager.destroy();
    services.planningEngine.destroy();
    services.toolOrchestrator.destroy();
    services.soulClient.close();
    services = null;
  }

  pluginState = null;

  console.log("[Brain Orchestrator] Shutdown complete.");
}

/**
 * Get plugin services
 */
export function getServices(): typeof services {
  return services;
}

/**
 * Get plugin state
 */
export function getState(): BrainOrchestratorState | null {
  return pluginState;
}

/**
 * Get plugin metrics
 */
export function getMetrics() {
  if (grpcServer) {
    return grpcServer.getMetrics();
  }
  return pluginState?.metrics ?? null;
}

/**
 * Brain Orchestrator Plugin Definition
 */
export const brainOrchestratorPlugin: Plugin = {
  name: "@discard/plugin-brain-orchestrator",
  description:
    "TEE-based intent parsing, planning, and orchestration for DisCard Financial OS",

  // Plugin actions
  actions: [
    {
      name: "PARSE_INTENT",
      description: "Parse natural language into a structured intent",
      similes: ["understand request", "parse request", "interpret"],
      examples: [
        [
          {
            name: "user",
            content: { text: "I want to add $50 to my card" },
          },
          {
            name: "brain",
            content: {
              text: "I understand you want to fund your card with $50.",
            },
          },
        ],
      ],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!services) {
          callback?.({ text: "Brain Orchestrator not initialized" });
          return { success: false, error: new Error("Brain Orchestrator not initialized") };
        }

        try {
          const rawText =
            typeof message.content === "string"
              ? message.content
              : (message.content as any).text || "";

          const { intent, needsClarification, clarification } =
            await services.intentParser.parse(rawText);

          if (needsClarification && clarification) {
            callback?.({
              text: clarification.question,
            });
            return { success: false, data: { intent, clarification } };
          }

          callback?.({
            text: `Parsed intent: ${intent.action}${intent.amount ? ` for $${intent.amount}` : ""}`,
          });

          return { success: true, data: { intent } };
        } catch (error) {
          callback?.({
            text: `Parse error: ${error instanceof Error ? error.message : "Unknown"}`,
          });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
      },
    },
    {
      name: "CREATE_PLAN",
      description: "Create an execution plan from an intent",
      similes: ["plan execution", "create steps"],
      examples: [],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!services) {
          callback?.({ text: "Not initialized" });
          return { success: false, error: new Error("Not initialized") };
        }

        try {
          const content = message.content as Record<string, unknown>;
          const intent = content.intent as any;
          const sessionId = (content.sessionId as string) || `session_${Date.now()}`;
          const entityId = message.entityId;

          const plan = services.planningEngine.createPlanFromIntent(
            intent,
            sessionId,
            entityId
          );

          callback?.({
            text: `Created plan with ${plan.totalSteps} steps`,
          });

          return { success: true, data: { plan } };
        } catch (error) {
          callback?.({
            text: `Plan error: ${error instanceof Error ? error.message : "Unknown"}`,
          });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
      },
    },
    {
      name: "EXECUTE_PLAN",
      description: "Execute a plan step by step",
      similes: ["run plan", "execute steps"],
      examples: [],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!services) {
          callback?.({ text: "Not initialized" });
          return { success: false, error: new Error("Not initialized") };
        }

        try {
          const content = message.content as Record<string, unknown>;
          const planId = content.planId as string;

          const events: any[] = [];
          await services.planningEngine.executePlan(planId, (event) => {
            events.push(event);
          });

          callback?.({
            text: `Plan executed. ${events.length} events.`,
          });

          return { success: true, data: { events } };
        } catch (error) {
          callback?.({
            text: `Execution error: ${error instanceof Error ? error.message : "Unknown"}`,
          });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
      },
    },
    {
      name: "VERIFY_WITH_SOUL",
      description: "Verify an intent with the Soul CVM",
      similes: ["check with soul", "verify intent"],
      examples: [],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!services) {
          callback?.({ text: "Not initialized" });
          return { success: false, error: new Error("Not initialized") };
        }

        try {
          const content = message.content as Record<string, unknown>;

          const result = await services.toolOrchestrator.callTool(
            "verify_intent",
            {
              intent: content.intent,
              context: {
                entityId: message.entityId,
                walletAddress: content.walletAddress || "",
                subOrganizationId: content.subOrganizationId || "",
              },
            }
          );

          callback?.({
            text: result.success
              ? "Intent verified by Soul"
              : `Verification failed: ${result.error}`,
          });

          return { success: result.success, data: { ...result } as Record<string, unknown> };
        } catch (error) {
          callback?.({
            text: `Soul verification error: ${error instanceof Error ? error.message : "Unknown"}`,
          });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
      },
    },
  ],

  // Plugin evaluators
  evaluators: [],

  // Plugin providers
  providers: [],

  // Plugin services (cast to any to avoid strict elizaOS type checking)
  services: [
    {
      name: "brain-orchestrator-grpc",
      description: "gRPC server for client communication",

      initialize: async (runtime: IAgentRuntime) => {
        const config: BrainOrchestratorConfig = {
          soulGrpcUrl:
            String(runtime.getSetting("SOUL_GRPC_URL") ?? "localhost:50051"),
          grpcPort: Number(runtime.getSetting("GRPC_PORT") ?? 50052),
          contextTtlSeconds: Number(
            runtime.getSetting("CONTEXT_TTL_SECONDS") ?? 3600
          ),
          maxContextTurns: Number(
            runtime.getSetting("MAX_CONTEXT_TURNS") ?? 50
          ),
          logLevel:
            (String(runtime.getSetting("LOG_LEVEL") ?? "info") as "debug" | "info" | "warn" | "error"),
        };

        await initialize(runtime, config);
      },
      stop: async () => {
        await shutdown();
      },
    },
  ] as any[],
};

// Default export
export default brainOrchestratorPlugin;
