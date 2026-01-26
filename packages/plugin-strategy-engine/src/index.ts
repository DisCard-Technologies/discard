/**
 * DisCard Strategy Engine Plugin
 *
 * elizaOS plugin for persistent strategies, condition monitoring,
 * and autonomous goal agents (DCA, stop-loss, take-profit, goals).
 */

import type { Plugin, IAgentRuntime } from '@elizaos/core';
import { StrategyStore, getStrategyStore, type StrategyStoreConfig } from './services/strategyStore.js';
import { StrategyEngineServer, type StrategyEngineServerConfig } from './grpc/server.js';

// Re-export types
export * from './types/index.js';

// Re-export services
export * from './services/index.js';
export { StrategyEngineServer, type StrategyEngineServerConfig } from './grpc/server.js';

// Re-export agents
export * from './agents/index.js';

// ============================================================================
// Plugin Configuration
// ============================================================================

export interface StrategyEnginePluginConfig {
  /** Redis URL for strategy storage */
  redisUrl: string;
  /** gRPC port for standalone mode */
  grpcPort: number;
  /** gRPC host */
  grpcHost: string;
  /** Enable TLS */
  enableTls: boolean;
  /** TLS certificate */
  tlsCert?: string;
  /** TLS key */
  tlsKey?: string;
  /** TLS CA */
  tlsCa?: string;
  /** Enable gRPC server (set false to use only as library) */
  enableGrpcServer: boolean;
}

const DEFAULT_CONFIG: StrategyEnginePluginConfig = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  grpcPort: parseInt(process.env.STRATEGY_ENGINE_PORT || '50053', 10),
  grpcHost: process.env.STRATEGY_ENGINE_HOST || '0.0.0.0',
  enableTls: process.env.ENABLE_TLS === 'true',
  enableGrpcServer: true,
};

// ============================================================================
// Plugin State
// ============================================================================

interface StrategyEngineState {
  initialized: boolean;
  metrics: {
    totalStrategiesCreated: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    errorCount: number;
  };
}

let store: StrategyStore | null = null;
let server: StrategyEngineServer | null = null;
let pluginConfig: StrategyEnginePluginConfig = { ...DEFAULT_CONFIG };
let pluginState: StrategyEngineState | null = null;

// ============================================================================
// Initialization
// ============================================================================

async function initialize(
  runtime: IAgentRuntime,
  config: StrategyEnginePluginConfig
): Promise<void> {
  console.log('[StrategyEngine] Initializing plugin...');

  // Merge with defaults
  pluginConfig = { ...DEFAULT_CONFIG, ...config };

  // Initialize store
  store = getStrategyStore({
    redisUrl: pluginConfig.redisUrl,
    keyPrefix: 'discard:strategy',
  });
  await store.initialize();
  console.log('[StrategyEngine] Strategy Store initialized');

  // Start gRPC server if enabled
  if (pluginConfig.enableGrpcServer) {
    server = new StrategyEngineServer(store, {
      port: pluginConfig.grpcPort,
      host: pluginConfig.grpcHost,
      enableTls: pluginConfig.enableTls,
      tlsCert: pluginConfig.tlsCert,
      tlsKey: pluginConfig.tlsKey,
      tlsCa: pluginConfig.tlsCa,
    });
    await server.start();
    console.log(`[StrategyEngine] gRPC server started on port ${pluginConfig.grpcPort}`);
  }

  // Initialize state
  pluginState = {
    initialized: true,
    metrics: {
      totalStrategiesCreated: 0,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      errorCount: 0,
    },
  };

  console.log('[StrategyEngine] Initialization complete');
}

async function shutdown(): Promise<void> {
  console.log('[StrategyEngine] Shutting down...');

  if (server) {
    await server.stop();
    server = null;
  }

  if (store) {
    await store.shutdown();
    store = null;
  }

  pluginState = null;
  console.log('[StrategyEngine] Shutdown complete');
}

// ============================================================================
// Plugin Definition
// ============================================================================

/**
 * Strategy Engine Plugin for elizaOS
 */
export const strategyEnginePlugin: Plugin = {
  name: '@discard/plugin-strategy-engine',
  description:
    'DisCard Strategy Engine - Persistent strategies for DCA, stop-loss, take-profit, and autonomous goal agents',

  actions: [
    {
      name: 'CREATE_STRATEGY',
      description: 'Create a new persistent strategy (DCA, stop-loss, take-profit, or goal)',
      similes: ['set up strategy', 'create automation', 'start dca', 'set stop loss'],
      examples: [
        [
          {
            name: 'user',
            content: { text: 'Set up a DCA for $50 SOL every week' },
          },
          {
            name: 'agent',
            content: {
              text: "I'll set up a weekly DCA for $50 of SOL. This will automatically buy SOL every week.",
            },
          },
        ],
      ],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        // Strategy creation requires conversational flow
        // This handler initiates the strategy builder
        callback?.({
          text: "I can help you set up a strategy. What type would you like to create?\n- DCA (dollar-cost averaging)\n- Stop-loss\n- Take-profit\n- Savings goal",
        });
        return { success: true, data: { action: 'strategy_builder_initiated' } };
      },
    },
    {
      name: 'LIST_STRATEGIES',
      description: "List user's active strategies",
      similes: ['show strategies', 'my automations', 'active dcas'],
      examples: [
        [
          {
            name: 'user',
            content: { text: 'Show my strategies' },
          },
          {
            name: 'agent',
            content: {
              text: 'Here are your active strategies...',
            },
          },
        ],
      ],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!store) {
          callback?.({ text: 'Strategy engine not initialized' });
          return { success: false, error: new Error('Strategy engine not initialized') };
        }

        try {
          const userId = message.entityId || 'unknown';
          const result = await store.listByUser(userId);

          if (result.strategies.length === 0) {
            callback?.({
              text: "You don't have any strategies set up yet. Would you like to create one?",
            });
            return { success: true, data: { strategies: [] } };
          }

          const strategyList = result.strategies
            .map((s, i) => `${i + 1}. ${s.name} (${s.type}) - ${s.status}`)
            .join('\n');

          callback?.({
            text: `Here are your strategies:\n\n${strategyList}`,
          });

          return { success: true, data: { strategies: result.strategies } };
        } catch (error) {
          callback?.({
            text: `Error listing strategies: ${error instanceof Error ? error.message : 'Unknown'}`,
          });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
      },
    },
    {
      name: 'PAUSE_STRATEGY',
      description: 'Pause an active strategy',
      similes: ['pause dca', 'stop strategy temporarily', 'hold automation'],
      examples: [],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!store) {
          callback?.({ text: 'Strategy engine not initialized' });
          return { success: false, error: new Error('Strategy engine not initialized') };
        }

        try {
          const content = message.content as Record<string, unknown>;
          const strategyId = content.strategyId as string;

          if (!strategyId) {
            callback?.({ text: 'Please specify which strategy to pause.' });
            return { success: false, error: new Error('Missing strategy ID') };
          }

          const strategy = await store.pause(strategyId);
          callback?.({ text: `Strategy "${strategy.name}" has been paused.` });
          return { success: true, data: { strategy } };
        } catch (error) {
          callback?.({
            text: `Error pausing strategy: ${error instanceof Error ? error.message : 'Unknown'}`,
          });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
      },
    },
    {
      name: 'RESUME_STRATEGY',
      description: 'Resume a paused strategy',
      similes: ['resume dca', 'restart strategy', 'continue automation'],
      examples: [],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!store) {
          callback?.({ text: 'Strategy engine not initialized' });
          return { success: false, error: new Error('Strategy engine not initialized') };
        }

        try {
          const content = message.content as Record<string, unknown>;
          const strategyId = content.strategyId as string;

          if (!strategyId) {
            callback?.({ text: 'Please specify which strategy to resume.' });
            return { success: false, error: new Error('Missing strategy ID') };
          }

          const strategy = await store.resume(strategyId);
          callback?.({ text: `Strategy "${strategy.name}" has been resumed.` });
          return { success: true, data: { strategy } };
        } catch (error) {
          callback?.({
            text: `Error resuming strategy: ${error instanceof Error ? error.message : 'Unknown'}`,
          });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
      },
    },
    {
      name: 'CANCEL_STRATEGY',
      description: 'Cancel and remove a strategy',
      similes: ['cancel dca', 'delete strategy', 'stop automation'],
      examples: [],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!store) {
          callback?.({ text: 'Strategy engine not initialized' });
          return { success: false, error: new Error('Strategy engine not initialized') };
        }

        try {
          const content = message.content as Record<string, unknown>;
          const strategyId = content.strategyId as string;

          if (!strategyId) {
            callback?.({ text: 'Please specify which strategy to cancel.' });
            return { success: false, error: new Error('Missing strategy ID') };
          }

          const strategy = await store.cancel(strategyId);
          callback?.({ text: `Strategy "${strategy.name}" has been cancelled.` });
          return { success: true, data: { strategy } };
        } catch (error) {
          callback?.({
            text: `Error cancelling strategy: ${error instanceof Error ? error.message : 'Unknown'}`,
          });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
      },
    },
    {
      name: 'STRATEGY_STATUS',
      description: 'Get the status and progress of a strategy',
      similes: ['strategy progress', 'goal status', 'dca progress'],
      examples: [],
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        if (!store) {
          callback?.({ text: 'Strategy engine not initialized' });
          return { success: false, error: new Error('Strategy engine not initialized') };
        }

        try {
          const content = message.content as Record<string, unknown>;
          const strategyId = content.strategyId as string;

          if (!strategyId) {
            callback?.({ text: 'Please specify which strategy to check.' });
            return { success: false, error: new Error('Missing strategy ID') };
          }

          const strategy = await store.get(strategyId);
          if (!strategy) {
            callback?.({ text: 'Strategy not found.' });
            return { success: false, error: new Error('Strategy not found') };
          }

          let statusText = `Strategy: ${strategy.name}\n`;
          statusText += `Type: ${strategy.type}\n`;
          statusText += `Status: ${strategy.status}\n`;
          statusText += `Executions: ${strategy.totalExecutions} (${strategy.successfulExecutions} successful)\n`;

          if (strategy.goalProgress) {
            statusText += `\nGoal Progress: ${strategy.goalProgress.progressPercentage.toFixed(1)}%\n`;
            statusText += `Current: $${strategy.goalProgress.currentAmount} / $${strategy.goalProgress.targetAmount}`;
          }

          callback?.({ text: statusText });
          return { success: true, data: { strategy } };
        } catch (error) {
          callback?.({
            text: `Error getting strategy status: ${error instanceof Error ? error.message : 'Unknown'}`,
          });
          return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
      },
    },
  ],

  evaluators: [],

  providers: [],

  // Plugin services (cast to any to avoid strict elizaOS type checking)
  services: [
    {
      name: 'strategy-engine-service',
      description: 'Strategy engine with gRPC server',

      initialize: async (runtime: IAgentRuntime) => {
        const config: StrategyEnginePluginConfig = {
          redisUrl: String(runtime.getSetting('REDIS_URL') ?? 'redis://localhost:6379'),
          grpcPort: Number(runtime.getSetting('STRATEGY_ENGINE_PORT') ?? 50053),
          grpcHost: String(runtime.getSetting('STRATEGY_ENGINE_HOST') ?? '0.0.0.0'),
          enableTls: runtime.getSetting('ENABLE_TLS') === 'true',
          tlsCert: runtime.getSetting('TLS_CERT') as string | undefined,
          tlsKey: runtime.getSetting('TLS_KEY') as string | undefined,
          tlsCa: runtime.getSetting('TLS_CA') as string | undefined,
          enableGrpcServer:
            runtime.getSetting('STRATEGY_ENGINE_GRPC_ENABLED') !== 'false',
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
export default strategyEnginePlugin;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the strategy store instance
 */
export function getStore(): StrategyStore | null {
  return store;
}

/**
 * Get the gRPC server instance
 */
export function getServer(): StrategyEngineServer | null {
  return server;
}

/**
 * Get current plugin configuration
 */
export function getPluginConfig(): StrategyEnginePluginConfig {
  return { ...pluginConfig };
}

/**
 * Get plugin state
 */
export function getPluginState(): StrategyEngineState | null {
  return pluginState;
}
