/**
 * DisCard Load Testing Script
 *
 * Simulates multiple users creating and managing strategies to test
 * the system under load.
 *
 * Usage:
 *   npx tsx scripts/load-test.ts [users=10] [strategiesPerUser=5]
 *
 * Example:
 *   npx tsx scripts/load-test.ts 50 10
 */

// @ts-ignore
import * as grpc from '@grpc/grpc-js';
// @ts-ignore
import * as protoLoader from '@grpc/proto-loader';
import { performance } from 'perf_hooks';

// Configuration
const CONFIG = {
  strategyEngineUrl: process.env.STRATEGY_ENGINE_URL || 'localhost:50053',
  brainUrl: process.env.BRAIN_URL || 'localhost:50052',
  users: parseInt(process.argv[2] || '10', 10),
  strategiesPerUser: parseInt(process.argv[3] || '5', 10),
  delayBetweenRequests: 100, // ms
};

// Metrics
interface Metrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  latencies: number[];
}

const metrics: Metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  avgLatencyMs: 0,
  maxLatencyMs: 0,
  minLatencyMs: Infinity,
  latencies: [],
};

// Simulated user actions
const STRATEGY_TYPES = ['dca', 'stop_loss', 'take_profit', 'goal'];
const TOKENS = ['SOL', 'USDC', 'JUP', 'BONK'];
const FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateUserId(index: number): string {
  return `load_test_user_${index}_${Date.now()}`;
}

function generateStrategyConfig(type: string): Record<string, unknown> {
  switch (type) {
    case 'dca':
      return {
        tokenPair: {
          from: 'USDC',
          to: randomElement(TOKENS.filter((t) => t !== 'USDC')),
        },
        amountPerExecution: Math.floor(Math.random() * 100) + 10,
        frequency: randomElement(FREQUENCIES),
        slippageTolerance: 1,
      };
    case 'stop_loss':
      return {
        token: randomElement(TOKENS),
        triggerPrice: Math.floor(Math.random() * 100) + 50,
        quoteCurrency: 'USD',
        triggerType: 'below',
        amountToSell: 'all',
        amount: 100,
        slippageTolerance: 1,
      };
    case 'take_profit':
      return {
        token: randomElement(TOKENS),
        triggerPrice: Math.floor(Math.random() * 500) + 100,
        quoteCurrency: 'USD',
        amountToSell: 'percentage',
        amount: 50,
        slippageTolerance: 1,
      };
    case 'goal':
      return {
        goalType: 'save',
        targetAmount: Math.floor(Math.random() * 10000) + 1000,
        targetToken: 'USDC',
        riskTolerance: randomElement(['conservative', 'moderate', 'aggressive']),
      };
    default:
      return {};
  }
}

async function simulateRequest<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T | null> {
  const start = performance.now();
  metrics.totalRequests++;

  try {
    const result = await fn();
    const latency = performance.now() - start;

    metrics.successfulRequests++;
    metrics.latencies.push(latency);
    metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, latency);
    metrics.minLatencyMs = Math.min(metrics.minLatencyMs, latency);

    return result;
  } catch (error) {
    metrics.failedRequests++;
    console.error(`[${operation}] Error:`, error);
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mock gRPC client for testing without actual server
class MockStrategyClient {
  private strategies: Map<string, unknown> = new Map();

  async createStrategy(request: {
    userId: string;
    type: string;
    name: string;
    config: unknown;
  }): Promise<{ strategyId: string }> {
    await sleep(Math.random() * 50 + 10); // Simulate network latency
    const strategyId = `strategy_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.strategies.set(strategyId, { ...request, strategyId, status: 'pending' });
    return { strategyId };
  }

  async listStrategies(request: { userId: string }): Promise<{ strategies: unknown[] }> {
    await sleep(Math.random() * 30 + 5);
    const userStrategies = Array.from(this.strategies.values()).filter(
      (s: any) => s.userId === request.userId
    );
    return { strategies: userStrategies };
  }

  async pauseStrategy(request: { strategyId: string }): Promise<{ success: boolean }> {
    await sleep(Math.random() * 20 + 5);
    const strategy = this.strategies.get(request.strategyId) as any;
    if (strategy) {
      strategy.status = 'paused';
      return { success: true };
    }
    return { success: false };
  }

  async activateStrategy(request: { strategyId: string }): Promise<{ success: boolean }> {
    await sleep(Math.random() * 20 + 5);
    const strategy = this.strategies.get(request.strategyId) as any;
    if (strategy) {
      strategy.status = 'active';
      return { success: true };
    }
    return { success: false };
  }
}

async function simulateUser(userId: string, client: MockStrategyClient): Promise<void> {
  const strategyIds: string[] = [];

  // Create strategies
  for (let i = 0; i < CONFIG.strategiesPerUser; i++) {
    const type = randomElement(STRATEGY_TYPES);
    const result = await simulateRequest(`create_${type}`, () =>
      client.createStrategy({
        userId,
        type,
        name: `Load Test ${type} ${i + 1}`,
        config: generateStrategyConfig(type),
      })
    );

    if (result) {
      strategyIds.push(result.strategyId);
    }

    await sleep(CONFIG.delayBetweenRequests);
  }

  // List strategies
  await simulateRequest('list_strategies', () =>
    client.listStrategies({ userId })
  );
  await sleep(CONFIG.delayBetweenRequests);

  // Pause some strategies
  for (const strategyId of strategyIds.slice(0, 2)) {
    await simulateRequest('pause_strategy', () =>
      client.pauseStrategy({ strategyId })
    );
    await sleep(CONFIG.delayBetweenRequests);
  }

  // Resume one
  if (strategyIds.length > 0) {
    await simulateRequest('activate_strategy', () =>
      client.activateStrategy({ strategyId: strategyIds[0] })
    );
  }
}

async function runLoadTest(): Promise<void> {
  console.log('='.repeat(60));
  console.log('DisCard Load Test');
  console.log('='.repeat(60));
  console.log(`Users: ${CONFIG.users}`);
  console.log(`Strategies per user: ${CONFIG.strategiesPerUser}`);
  console.log(`Expected requests: ~${CONFIG.users * (CONFIG.strategiesPerUser + 4)}`);
  console.log('='.repeat(60));
  console.log('');

  const client = new MockStrategyClient();
  const startTime = performance.now();

  // Run simulated users in parallel batches
  const batchSize = 10;
  const users = Array.from({ length: CONFIG.users }, (_, i) => generateUserId(i));

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    console.log(`Running batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)}...`);

    await Promise.all(batch.map((userId) => simulateUser(userId, client)));
  }

  const totalTime = performance.now() - startTime;

  // Calculate final metrics
  if (metrics.latencies.length > 0) {
    metrics.avgLatencyMs =
      metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length;
  }

  // Print results
  console.log('');
  console.log('='.repeat(60));
  console.log('Load Test Results');
  console.log('='.repeat(60));
  console.log(`Total time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Total requests: ${metrics.totalRequests}`);
  console.log(`Successful: ${metrics.successfulRequests}`);
  console.log(`Failed: ${metrics.failedRequests}`);
  console.log(`Success rate: ${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)}%`);
  console.log('');
  console.log('Latency (ms):');
  console.log(`  Avg: ${metrics.avgLatencyMs.toFixed(2)}`);
  console.log(`  Min: ${metrics.minLatencyMs.toFixed(2)}`);
  console.log(`  Max: ${metrics.maxLatencyMs.toFixed(2)}`);
  console.log('');
  console.log(`Throughput: ${(metrics.totalRequests / (totalTime / 1000)).toFixed(2)} req/s`);
  console.log('='.repeat(60));
}

// Run the load test
runLoadTest().catch(console.error);
