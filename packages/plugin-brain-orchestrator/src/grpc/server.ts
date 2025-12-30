/**
 * Brain Orchestrator gRPC Server
 *
 * Implements the BrainOrchestratorService gRPC interface
 * for client communication.
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import type { IntentParser } from "../services/intentParser.js";
import type { ContextManager } from "../services/contextManager.js";
import type { PlanningEngine } from "../services/planningEngine.js";
import type { ToolOrchestrator } from "../services/toolOrchestrator.js";
import type { SoulVerifier } from "../attestation/soulVerifier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Server configuration
 */
export interface BrainGrpcServerConfig {
  port: number;
  host: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BrainGrpcServerConfig = {
  port: 50052,
  host: "0.0.0.0",
};

/**
 * Service metrics
 */
export interface Metrics {
  totalRequests: number;
  intentsParsed: number;
  plansExecuted: number;
  soulVerifications: number;
  conversations: number;
  errors: number;
  startTime: number;
}

/**
 * Brain Orchestrator gRPC Server
 */
export class BrainGrpcServer {
  private config: BrainGrpcServerConfig;
  private server: grpc.Server;
  private intentParser: IntentParser;
  private contextManager: ContextManager;
  private planningEngine: PlanningEngine;
  private toolOrchestrator: ToolOrchestrator;
  private soulVerifier: SoulVerifier;
  private metrics: Metrics;
  private isRunning: boolean = false;

  constructor(
    intentParser: IntentParser,
    contextManager: ContextManager,
    planningEngine: PlanningEngine,
    toolOrchestrator: ToolOrchestrator,
    soulVerifier: SoulVerifier,
    config?: Partial<BrainGrpcServerConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.intentParser = intentParser;
    this.contextManager = contextManager;
    this.planningEngine = planningEngine;
    this.toolOrchestrator = toolOrchestrator;
    this.soulVerifier = soulVerifier;
    this.server = new grpc.Server();
    this.metrics = {
      totalRequests: 0,
      intentsParsed: 0,
      plansExecuted: 0,
      soulVerifications: 0,
      conversations: 0,
      errors: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Start the gRPC server
   */
  async start(): Promise<void> {
    // Proto file path - handle both dev (src/) and prod (dist/) builds
    // When built, __dirname is dist/, but proto files are in src/grpc/proto/
    let protoPath = resolve(__dirname, "proto/brain_orchestrator.proto");

    // If not found in current dir, try src/grpc/proto (for production builds)
    const fs = await import("fs");
    if (!fs.existsSync(protoPath)) {
      protoPath = resolve(__dirname, "../src/grpc/proto/brain_orchestrator.proto");
    }

    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const proto = grpc.loadPackageDefinition(packageDef) as any;
    const service = proto.discard.brain_orchestrator.v1.BrainOrchestratorService.service;

    // Add service handlers
    this.server.addService(service, {
      parseIntent: this.handleParseIntent.bind(this),
      executePlan: this.handleExecutePlan.bind(this),
      converse: this.handleConverse.bind(this),
      getContext: this.handleGetContext.bind(this),
      resetSession: this.handleResetSession.bind(this),
      getAttestation: this.handleGetAttestation.bind(this),
      healthCheck: this.handleHealthCheck.bind(this),
    });

    // Bind and start
    return new Promise((resolve, reject) => {
      const address = `${this.config.host}:${this.config.port}`;
      this.server.bindAsync(
        address,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            reject(error);
            return;
          }
          this.isRunning = true;
          console.log(`[BrainGrpcServer] Listening on ${address}`);
          resolve();
        }
      );
    });
  }

  /**
   * Handle ParseIntent RPC
   */
  private async handleParseIntent(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      const { sessionId, userId, rawText, metadata } = call.request;

      // Ensure session exists
      this.contextManager.getOrCreateSession(sessionId, userId);

      // Parse the intent
      const { intent, needsClarification, clarification } =
        await this.intentParser.parse(rawText);

      this.metrics.intentsParsed++;

      // Add to context
      this.contextManager.addTurn(sessionId, "user", rawText, intent);

      // Create suggested plan if not needing clarification
      let suggestedPlan: any[] = [];
      if (!needsClarification && intent.action !== "unknown") {
        const plan = this.planningEngine.createPlanFromIntent(
          intent,
          sessionId,
          userId
        );
        suggestedPlan = plan.steps.map((step) => ({
          stepId: step.stepId,
          sequence: step.sequence,
          action: step.action,
          description: step.description,
          parameters: step.parameters,
          dependsOn: step.dependsOn,
          requiresSoulVerification: step.requiresSoulVerification,
          status: "STEP_PENDING",
        }));
      }

      callback(null, {
        success: true,
        intent: {
          intentId: intent.intentId,
          action: intent.action,
          sourceType: intent.sourceType || "",
          sourceId: intent.sourceId || "",
          targetType: intent.targetType || "",
          targetId: intent.targetId || "",
          amountCents: intent.amount ? Math.round(intent.amount * 100) : 0,
          currency: intent.currency || "USDC",
          merchant: intent.merchant
            ? {
                merchantId: intent.merchant.merchantId || "",
                merchantName: intent.merchant.merchantName || "",
                mccCode: intent.merchant.mccCode || "",
                inferredFromText: intent.merchant.inferredFromText,
              }
            : undefined,
          rawText: intent.rawText,
          entities: intent.entities.map((e) => ({
            type: e.type,
            value: e.value,
            confidence: e.confidence,
            startIndex: e.startIndex,
            endIndex: e.endIndex,
          })),
          parsedAtMs: intent.parsedAt,
        },
        needsClarification,
        clarificationQuestion: clarification?.question || "",
        clarificationOptions: clarification?.options?.map((o) => ({
          label: o.label,
          value: o.value,
          confidence: o.confidence,
        })) || [],
        confidence: intent.confidence,
        suggestedPlan,
        parseTimeMs: Date.now() - startTime,
      });
    } catch (error) {
      this.metrics.errors++;
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Handle ExecutePlan RPC (streaming)
   */
  private handleExecutePlan(
    call: grpc.ServerWritableStream<any, any>
  ): void {
    this.metrics.totalRequests++;

    const { sessionId, userId, planId, steps, requireApprovalPerStep } =
      call.request;

    // Get or create plan
    let plan = this.planningEngine.getPlan(planId);
    if (!plan && steps?.length > 0) {
      // Create plan from provided steps
      // This is a simplified implementation
      plan = {
        planId: planId || uuidv4(),
        sessionId,
        userId,
        originalIntent: { intentId: "", action: "unknown" } as any,
        steps: steps.map((s: any, i: number) => ({
          stepId: s.stepId || uuidv4(),
          planId: planId,
          sequence: s.sequence || i,
          action: s.action,
          description: s.description || "",
          parameters: s.parameters || {},
          dependsOn: s.dependsOn || [],
          requiresSoulVerification: s.requiresSoulVerification,
          status: "pending" as any,
          retryCount: 0,
          maxRetries: 2,
        })),
        status: "pending",
        createdAt: Date.now(),
        totalSteps: steps.length,
        completedSteps: 0,
        requiresApproval: requireApprovalPerStep,
      };
    }

    if (!plan) {
      call.emit("error", {
        code: grpc.status.NOT_FOUND,
        message: `Plan ${planId} not found`,
      });
      call.end();
      return;
    }

    // Execute plan with event streaming
    this.planningEngine
      .executePlan(plan.planId, (event) => {
        call.write({
          eventId: event.eventId,
          planId: event.planId,
          stepId: event.stepId || "",
          eventType: this.eventTypeToProto(event.eventType),
          message: event.message,
          data: event.data || {},
          soulAttestation: "",
          timestampMs: event.timestamp,
        });

        if (event.eventType === "step_verified") {
          this.metrics.soulVerifications++;
        }
      })
      .then(() => {
        this.metrics.plansExecuted++;
        call.end();
      })
      .catch((error) => {
        this.metrics.errors++;
        call.emit("error", {
          code: grpc.status.INTERNAL,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        call.end();
      });
  }

  /**
   * Handle Converse RPC
   */
  private async handleConverse(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.conversations++;

    try {
      const { sessionId, userId, message, includeContext } = call.request;

      // Get or create session
      const session = this.contextManager.getOrCreateSession(sessionId, userId);

      // Parse intent from message
      const { intent, needsClarification } =
        await this.intentParser.parse(message);

      // Add user message to context
      this.contextManager.addTurn(sessionId, "user", message, intent);

      // Generate response
      let responseText = "";
      if (needsClarification) {
        responseText = `I'd like to help with that. Could you please clarify what you'd like to do?`;
      } else if (intent.action === "unknown") {
        responseText = `I'm not sure what you'd like to do. You can ask me to fund your card, transfer money, swap tokens, or check your balance.`;
      } else {
        responseText = `I'll help you ${intent.action.replace(/_/g, " ")}${intent.amount ? ` for $${intent.amount}` : ""}.`;
      }

      // Add assistant response to context
      this.contextManager.addTurn(sessionId, "assistant", responseText);

      // Generate suggestions
      const suggestions = this.generateSuggestions(intent);

      // Build context response if requested
      let contextResponse: any = undefined;
      if (includeContext) {
        contextResponse = {
          sessionId: session.sessionId,
          userId: session.userId,
          history: session.history.slice(-10).map((t) => ({
            id: t.id,
            role: t.role,
            content: t.content,
            timestampMs: t.timestamp,
          })),
          userState: {},
          activeIntents: session.activeIntents,
          createdAtMs: session.createdAt,
          lastActivityMs: session.lastActivityAt,
          expiresAtMs: session.expiresAt,
        };
      }

      callback(null, {
        responseText,
        detectedIntent: intent.action !== "unknown" ? {
          intentId: intent.intentId,
          action: intent.action,
          amountCents: intent.amount ? Math.round(intent.amount * 100) : 0,
          currency: intent.currency || "USDC",
        } : undefined,
        suggestions,
        context: contextResponse,
        responseTimeMs: Date.now() - startTime,
      });
    } catch (error) {
      this.metrics.errors++;
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Handle GetContext RPC
   */
  private async handleGetContext(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    this.metrics.totalRequests++;

    try {
      const { sessionId } = call.request;
      const session = this.contextManager.getSession(sessionId);

      if (!session) {
        callback(null, {
          found: false,
          context: undefined,
        });
        return;
      }

      callback(null, {
        found: true,
        context: {
          sessionId: session.sessionId,
          userId: session.userId,
          history: session.history.map((t) => ({
            id: t.id,
            role: t.role,
            content: t.content,
            timestampMs: t.timestamp,
          })),
          userState: {},
          activeIntents: session.activeIntents,
          createdAtMs: session.createdAt,
          lastActivityMs: session.lastActivityAt,
          expiresAtMs: session.expiresAt,
        },
      });
    } catch (error) {
      this.metrics.errors++;
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Handle ResetSession RPC
   */
  private async handleResetSession(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    this.metrics.totalRequests++;

    try {
      const { sessionId, preserveUserState } = call.request;
      const newSessionId = this.contextManager.resetSession(
        sessionId,
        preserveUserState
      );

      callback(null, {
        success: true,
        newSessionId,
      });
    } catch (error) {
      this.metrics.errors++;
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Handle GetAttestation RPC
   */
  private async handleGetAttestation(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    this.metrics.totalRequests++;

    try {
      const { nonce, includeSoulAttestation } = call.request;

      // Get Soul attestation
      let soulAttestation: any = undefined;
      if (includeSoulAttestation) {
        const verification = await this.soulVerifier.verifySoulAttestation(true);
        if (verification.verified && verification.attestation) {
          soulAttestation = {
            quote: verification.attestation.quote,
            mrEnclave: verification.attestation.mrEnclave,
            mrSigner: verification.attestation.mrSigner,
            verified: true,
            timestamp: verification.attestation.timestamp,
          };
          this.metrics.soulVerifications++;
        }
      }

      // In production, would generate Brain's own attestation
      const brainTimestamp = Date.now();

      callback(null, {
        brainQuote: Buffer.from("BRAIN_QUOTE_PLACEHOLDER"),
        brainMrEnclave: "brain_mr_enclave_placeholder",
        brainMrSigner: "brain_mr_signer_placeholder",
        brainTimestamp,
        brainExpiresAt: brainTimestamp + 60000,
        soulIncluded: !!soulAttestation,
        soulQuote: soulAttestation?.quote || Buffer.from([]),
        soulMrEnclave: soulAttestation?.mrEnclave || "",
        soulMrSigner: soulAttestation?.mrSigner || "",
        soulVerified: soulAttestation?.verified || false,
        soulTimestamp: soulAttestation?.timestamp || 0,
      });
    } catch (error) {
      this.metrics.errors++;
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Handle HealthCheck RPC
   */
  private async handleHealthCheck(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    this.metrics.totalRequests++;

    try {
      const { includeDetails } = call.request;

      // Check Soul connection
      const soulHealth = await this.toolOrchestrator
        .callTool("get_attestation", {})
        .catch(() => ({ success: false }));

      const soulConnected = soulHealth.success;
      const soulAttestationValid = soulHealth.success;

      const status = soulConnected ? "HEALTHY" : "DEGRADED";
      const uptimeSeconds = Math.floor(
        (Date.now() - this.metrics.startTime) / 1000
      );

      let details: any = undefined;
      if (includeDetails) {
        const contextStats = this.contextManager.getStats();
        const orchestratorStats = this.toolOrchestrator.getStats();

        details = {
          llmAvailable: true,
          contextStorageHealthy: true,
          soulReachable: soulConnected,
          soulAttestationExpiresAt: 0,
          llmModel: "llama-3.3-70b",
          contextTtlSeconds: 3600,
          maxContextTurns: 50,
        };
      }

      callback(null, {
        status,
        version: "1.0.0",
        uptimeSeconds,
        soulConnected,
        soulAttestationValid,
        metrics: {
          totalRequests: this.metrics.totalRequests,
          intentsParsed: this.metrics.intentsParsed,
          plansExecuted: this.metrics.plansExecuted,
          soulVerifications: this.metrics.soulVerifications,
          conversations: this.metrics.conversations,
          avgParseTimeMs: 50,
          avgPlanExecutionMs: 200,
          activeSessions: this.contextManager.getStats().activeSessions,
          errorCount: this.metrics.errors,
        },
        details,
      });
    } catch (error) {
      this.metrics.errors++;
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Generate action suggestions
   */
  private generateSuggestions(
    intent: any
  ): Array<{ action: string; displayText: string; confidence: number }> {
    const suggestions = [];

    if (intent.action === "fund_card") {
      suggestions.push({
        action: "check_balance",
        displayText: "Check balance first",
        confidence: 0.7,
      });
    }

    if (intent.action === "transfer") {
      suggestions.push({
        action: "check_velocity",
        displayText: "View daily limits",
        confidence: 0.6,
      });
    }

    return suggestions;
  }

  /**
   * Convert event type to proto enum
   */
  private eventTypeToProto(eventType: string): string {
    const mapping: Record<string, string> = {
      plan_started: "PLAN_STARTED",
      step_started: "STEP_STARTED",
      step_awaiting_approval: "STEP_AWAITING_APPROVAL",
      step_verified: "STEP_VERIFIED",
      step_completed: "STEP_COMPLETED",
      step_failed: "STEP_FAILED",
      step_retrying: "STEP_RETRYING",
      plan_completed: "PLAN_COMPLETED",
      plan_failed: "PLAN_FAILED",
      plan_cancelled: "PLAN_CANCELLED",
    };
    return mapping[eventType] || "PLAN_EVENT_UNSPECIFIED";
  }

  /**
   * Stop the server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        this.isRunning = false;
        console.log("[BrainGrpcServer] Stopped");
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get metrics
   */
  getMetrics(): Metrics {
    return { ...this.metrics };
  }
}
