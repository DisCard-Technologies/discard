/**
 * Standalone entry point for Financial Armor service
 *
 * Runs the gRPC server and services without requiring elizaOS runtime.
 * Used for deployment in Phala TEE environment.
 */

import { Connection } from "@solana/web3.js";
import { MerchantValidator } from "./services/merchantValidator.js";
import { VelocityChecker } from "./services/velocityChecker.js";
import { AttestationProvider } from "./services/attestationProvider.js";
import { TurnkeyBridge } from "./services/turnkeyBridge.js";
import { IntentVerifier } from "./services/intentVerifier.js";
import { FinancialArmorGrpcServer } from "./grpc/server.js";
import type { FinancialArmorConfig } from "./types/index.js";

/**
 * Load configuration from environment variables
 */
function loadConfig(): FinancialArmorConfig {
  return {
    solanaRpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    heliusRpcUrl: process.env.HELIUS_RPC_URL,
    compressionRpcUrl: process.env.COMPRESSION_RPC_URL,
    turnkeyOrganizationId: process.env.TURNKEY_ORGANIZATION_ID ?? "",
    turnkeyApiBaseUrl: process.env.TURNKEY_API_BASE_URL ?? "https://api.turnkey.com",
    grpcPort: Number(process.env.GRPC_PORT ?? 50051),
    attestationEndpoint: process.env.ATTESTATION_ENDPOINT,
    logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
    metricsEnabled: process.env.METRICS_ENABLED !== "false",
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log("[Financial Armor] Starting standalone server...");
  console.log(`[Financial Armor] Node version: ${process.version}`);
  console.log(`[Financial Armor] Environment: ${process.env.NODE_ENV ?? "development"}`);

  const config = loadConfig();

  console.log("[Financial Armor] Configuration loaded:");
  console.log(`  - Solana RPC: ${config.solanaRpcUrl}`);
  console.log(`  - gRPC Port: ${config.grpcPort}`);
  console.log(`  - Log Level: ${config.logLevel}`);

  // Initialize Solana connection
  const connection = new Connection(
    config.heliusRpcUrl ?? config.solanaRpcUrl,
    "confirmed"
  );
  console.log("[Financial Armor] Solana connection initialized");

  // Initialize services
  const merchantValidator = new MerchantValidator(connection);
  console.log("[Financial Armor] MerchantValidator initialized");

  const velocityChecker = new VelocityChecker(
    config.solanaRpcUrl,
    config.compressionRpcUrl
  );
  console.log("[Financial Armor] VelocityChecker initialized");

  const attestationProvider = new AttestationProvider({
    attestationEndpoint: config.attestationEndpoint,
    autoRefresh: true,
  });
  console.log("[Financial Armor] AttestationProvider initialized");

  const turnkeyBridge = new TurnkeyBridge({
    apiBaseUrl: config.turnkeyApiBaseUrl ?? "https://api.turnkey.com",
    organizationId: config.turnkeyOrganizationId,
    stamper: attestationProvider,
  });
  console.log("[Financial Armor] TurnkeyBridge initialized");

  const intentVerifier = new IntentVerifier(
    merchantValidator,
    velocityChecker,
    attestationProvider,
    { debug: config.logLevel === "debug" }
  );
  console.log("[Financial Armor] IntentVerifier initialized");

  // Initialize gRPC server
  const grpcServer = new FinancialArmorGrpcServer({
    port: config.grpcPort,
    intentVerifier,
    merchantValidator,
    velocityChecker,
    attestationProvider,
  });

  await grpcServer.start();
  console.log(`[Financial Armor] gRPC server started on port ${config.grpcPort}`);

  // Start HTTP health check server
  // Using port 8091 to avoid conflict with Phala's native attestation service on 8090
  const http = await import("http");
  const healthPort = Number(process.env.HEALTH_PORT ?? 8091);

  const healthServer = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "healthy",
        service: "financial-armor",
        timestamp: new Date().toISOString(),
        metrics: grpcServer.getMetrics(),
      }));
    } else if (req.url === "/metrics") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(grpcServer.getMetrics()));
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  healthServer.listen(healthPort, () => {
    console.log(`[Financial Armor] Health server started on port ${healthPort}`);
  });

  console.log("[Financial Armor] Service fully operational");
  console.log("[Financial Armor] Endpoints:");
  console.log(`  - gRPC: 0.0.0.0:${config.grpcPort}`);
  console.log(`  - Health: http://0.0.0.0:${healthPort}/health`);
  console.log(`  - Metrics: http://0.0.0.0:${healthPort}/metrics`);

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\n[Financial Armor] Shutting down...");

    healthServer.close();
    await grpcServer.stop();
    attestationProvider.destroy();

    console.log("[Financial Armor] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  process.on("uncaughtException", (error) => {
    console.error("[Financial Armor] Uncaught exception:", error);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[Financial Armor] Unhandled rejection:", reason);
  });
}

// Run the server
main().catch((error) => {
  console.error("[Financial Armor] Fatal error:", error);
  process.exit(1);
});
