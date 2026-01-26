/**
 * Strategy Engine Standalone Server
 *
 * Entry point for running the Strategy Engine as a standalone gRPC service.
 * This allows the strategy engine to run independently of elizaOS.
 */

import { StrategyStore, getStrategyStore } from './services/strategyStore.js';
import { StrategyEngineServer } from './grpc/server.js';

// ============================================================================
// Configuration from Environment
// ============================================================================

interface ServerConfig {
  grpcPort: number;
  grpcHost: string;
  redisUrl: string;
  enableTls: boolean;
  tlsCert?: string;
  tlsKey?: string;
  tlsCa?: string;
}

function loadConfig(): ServerConfig {
  return {
    grpcPort: parseInt(process.env.STRATEGY_ENGINE_PORT || '50053', 10),
    grpcHost: process.env.STRATEGY_ENGINE_HOST || '0.0.0.0',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    enableTls: process.env.ENABLE_TLS === 'true',
    tlsCert: process.env.TLS_CERT,
    tlsKey: process.env.TLS_KEY,
    tlsCa: process.env.TLS_CA,
  };
}

// ============================================================================
// Main Server
// ============================================================================

class StrategyEngineStandalone {
  private config: ServerConfig;
  private store: StrategyStore;
  private server: StrategyEngineServer;
  private shuttingDown: boolean = false;

  constructor() {
    this.config = loadConfig();
    this.store = getStrategyStore({
      redisUrl: this.config.redisUrl,
      keyPrefix: 'discard:strategy',
    });
    this.server = new StrategyEngineServer(this.store, {
      port: this.config.grpcPort,
      host: this.config.grpcHost,
      enableTls: this.config.enableTls,
      tlsCert: this.config.tlsCert,
      tlsKey: this.config.tlsKey,
      tlsCa: this.config.tlsCa,
    });
  }

  async start(): Promise<void> {
    console.log('='.repeat(60));
    console.log('  DisCard Strategy Engine - Standalone Server');
    console.log('='.repeat(60));
    console.log('');
    console.log('Configuration:');
    console.log(`  gRPC Port:    ${this.config.grpcPort}`);
    console.log(`  gRPC Host:    ${this.config.grpcHost}`);
    console.log(`  Redis URL:    ${this.config.redisUrl}`);
    console.log(`  TLS Enabled:  ${this.config.enableTls}`);
    console.log('');

    // Initialize store
    console.log('[Startup] Initializing Strategy Store...');
    await this.store.initialize();
    console.log('[Startup] Strategy Store initialized');

    // Start gRPC server
    console.log('[Startup] Starting gRPC server...');
    await this.server.start();
    console.log('[Startup] gRPC server started');

    console.log('');
    console.log('='.repeat(60));
    console.log('  Strategy Engine is ready to accept connections');
    console.log('='.repeat(60));
    console.log('');

    // Setup graceful shutdown
    this.setupShutdownHandlers();
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.shuttingDown) {
        console.log('[Shutdown] Already shutting down, please wait...');
        return;
      }

      this.shuttingDown = true;
      console.log(`\n[Shutdown] Received ${signal}, gracefully shutting down...`);

      try {
        // Stop gRPC server
        console.log('[Shutdown] Stopping gRPC server...');
        await this.server.stop();

        // Shutdown store
        console.log('[Shutdown] Closing Redis connection...');
        await this.store.shutdown();

        console.log('[Shutdown] Shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('[Shutdown] Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', (error) => {
      console.error('[Error] Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Error] Unhandled rejection at:', promise, 'reason:', reason);
    });
  }
}

// ============================================================================
// Entry Point
// ============================================================================

async function main(): Promise<void> {
  try {
    const server = new StrategyEngineStandalone();
    await server.start();
  } catch (error) {
    console.error('[Fatal] Failed to start Strategy Engine:', error);
    process.exit(1);
  }
}

main();
