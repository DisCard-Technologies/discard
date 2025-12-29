/**
 * DisCard Brain Orchestrator - Standalone Server
 *
 * Entry point for running the Brain CVM as a standalone service
 * without elizaOS runtime. Used for Phala TEE deployment.
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { IntentParser } from "./services/intentParser.js";
import { ContextManager } from "./services/contextManager.js";
import { PlanningEngine } from "./services/planningEngine.js";
import { ToolOrchestrator } from "./services/toolOrchestrator.js";
import { SoulClient } from "./services/soulClient.js";
import { SoulVerifier } from "./attestation/soulVerifier.js";
import { BrainGrpcServer } from "./grpc/server.js";

/**
 * Configuration from environment
 */
interface ServerConfig {
  soulGrpcUrl: string;
  soulAttestationUrl: string;
  grpcPort: number;
  httpPort: number;
  contextTtlSeconds: number;
  maxContextTurns: number;
  logLevel: string;
}

/**
 * Load configuration from environment
 */
function loadConfig(): ServerConfig {
  return {
    soulGrpcUrl: process.env.SOUL_GRPC_URL || "localhost:50051",
    soulAttestationUrl:
      process.env.SOUL_ATTESTATION_URL || "http://localhost:8090",
    grpcPort: Number(process.env.GRPC_PORT || 50052),
    httpPort: Number(process.env.HTTP_PORT || 8092),
    contextTtlSeconds: Number(process.env.CONTEXT_TTL_SECONDS || 3600),
    maxContextTurns: Number(process.env.MAX_CONTEXT_TURNS || 50),
    logLevel: process.env.LOG_LEVEL || "info",
  };
}

/**
 * Main server startup
 */
async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║        DisCard Brain Orchestrator - Standalone CVM         ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");

  const config = loadConfig();

  console.log("[Brain] Configuration:");
  console.log(`  - Soul gRPC URL: ${config.soulGrpcUrl}`);
  console.log(`  - gRPC Port: ${config.grpcPort}`);
  console.log(`  - HTTP Port: ${config.httpPort}`);
  console.log(`  - Context TTL: ${config.contextTtlSeconds}s`);
  console.log(`  - Max Context Turns: ${config.maxContextTurns}`);
  console.log(`  - Log Level: ${config.logLevel}`);
  console.log("");

  // Initialize Soul client
  console.log("[Brain] Initializing Soul client...");
  const soulClient = new SoulClient({
    soulGrpcUrl: config.soulGrpcUrl,
    timeoutMs: 5000,
  });

  // Initialize Soul verifier
  console.log("[Brain] Initializing Soul verifier...");
  const soulVerifier = new SoulVerifier(soulClient, {
    attestationCacheTtlMs: 60000,
    verifyOnEveryRequest: false,
    strictMode: false, // Allow startup without Soul connection
  });

  // Initialize services
  console.log("[Brain] Initializing intent parser...");
  const intentParser = new IntentParser({
    confidenceThreshold: 0.7,
    clarificationThreshold: 0.5,
  });

  console.log("[Brain] Initializing context manager...");
  const contextManager = new ContextManager({
    maxTurns: config.maxContextTurns,
    ttlSeconds: config.contextTtlSeconds,
    persistUserState: true,
  });

  console.log("[Brain] Initializing planning engine...");
  const planningEngine = new PlanningEngine(soulClient, {
    maxStepsPerPlan: 10,
    defaultTimeoutMs: 30000,
    requireApprovalByDefault: true,
  });

  console.log("[Brain] Initializing tool orchestrator...");
  const toolOrchestrator = new ToolOrchestrator(soulClient, soulVerifier, {
    timeoutMs: 10000,
    maxConcurrentCalls: 5,
  });

  // Initialize gRPC server
  console.log("[Brain] Initializing gRPC server...");
  const grpcServer = new BrainGrpcServer(
    intentParser,
    contextManager,
    planningEngine,
    toolOrchestrator,
    soulVerifier,
    { port: config.grpcPort }
  );

  // Start gRPC server
  console.log("[Brain] Starting gRPC server...");
  await grpcServer.start();
  console.log(`[Brain] gRPC server listening on port ${config.grpcPort}`);

  // Start HTTP server for health checks and attestation
  console.log("[Brain] Starting HTTP health server...");
  const startTime = Date.now();

  const httpServer = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || "/";
      const method = req.method || "GET";

      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url === "/health" || url === "/health/") {
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const metrics = grpcServer.getMetrics();
        const health = {
          status: "healthy",
          service: "brain-orchestrator",
          version: "1.0.0",
          uptime,
          grpcPort: config.grpcPort,
          metrics: {
            totalRequests: metrics.totalRequests,
            intentsParsed: metrics.intentsParsed,
            plansExecuted: metrics.plansExecuted,
            errors: metrics.errors,
          },
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(health));
        return;
      }

      if (url === "/attestation" || url === "/attestation/") {
        // Placeholder attestation response for TEE
        const attestation = {
          service: "brain-orchestrator",
          timestamp: Date.now(),
          mrEnclave: "brain_mr_enclave_placeholder",
          mrSigner: "brain_mr_signer_placeholder",
          teeType: "phala-sgx",
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(attestation));
        return;
      }

      if (url === "/" || url === "/ready") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  );

  httpServer.listen(config.httpPort, "0.0.0.0", () => {
    console.log(`[Brain] HTTP health server listening on port ${config.httpPort}`);
  });

  // Try to connect to Soul CVM
  console.log("[Brain] Attempting connection to Soul CVM...");
  try {
    await soulClient.connect();
    console.log("[Brain] ✓ Connected to Soul CVM");
  } catch (error) {
    console.warn(
      `[Brain] ⚠ Could not connect to Soul CVM: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    console.warn("[Brain] Will retry connection on first request");
  }

  console.log("");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║              Brain Orchestrator Running                    ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  gRPC:        0.0.0.0:${config.grpcPort}`);
  console.log(`  Health:      http://0.0.0.0:${config.httpPort}/health`);
  console.log(`  Attestation: http://0.0.0.0:${config.httpPort}/attestation`);
  console.log("");

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    console.log(`\n[Brain] Received ${signal}, shutting down gracefully...`);

    try {
      // Close HTTP server
      httpServer.close();
      console.log("[Brain] HTTP server stopped");

      // Stop gRPC server
      await grpcServer.stop();
      console.log("[Brain] gRPC server stopped");

      // Cleanup services
      contextManager.destroy();
      planningEngine.destroy();
      toolOrchestrator.destroy();
      soulClient.close();

      console.log("[Brain] All services stopped");
      process.exit(0);
    } catch (error) {
      console.error("[Brain] Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Keep process alive
  process.stdin.resume();
}

// Start server
main().catch((error) => {
  console.error("[Brain] Fatal error during startup:", error);
  process.exit(1);
});
