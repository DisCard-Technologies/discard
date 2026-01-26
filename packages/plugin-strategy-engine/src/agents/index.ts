/**
 * Strategy Engine Agents - Public Exports
 */

// DCA Agent
export {
  DCAAgent,
  getDCAAgent,
  resetDCAAgent,
  type DCAAgentConfig,
} from './dcaAgent.js';

// Trigger Agent (Stop-Loss / Take-Profit)
export {
  TriggerAgent,
  getTriggerAgent,
  resetTriggerAgent,
  type TriggerAgentConfig,
} from './triggerAgent.js';

// Goal Orchestrator
export {
  GoalOrchestrator,
  getGoalOrchestrator,
  resetGoalOrchestrator,
  type GoalOrchestratorConfig,
  type GoalStatus,
} from './goalOrchestrator.js';

// Yield Harvester
export {
  YieldHarvesterAgent,
  getYieldHarvester,
  resetYieldHarvester,
  type YieldHarvesterConfig,
  type HarvestSummary,
  // Protocol adapters
  getProtocolRegistry,
  resetProtocolRegistry,
  type ProtocolAdapter,
  // Yield optimizer
  YieldOptimizer,
  getYieldOptimizer,
  resetYieldOptimizer,
  type YieldOptimizerConfig,
  type AllocationPlan,
  type RebalancePlan,
} from './yieldHarvester/index.js';

// Protocol adapters (direct exports)
export {
  MarinadeAdapter,
  getMarinadeAdapter,
  resetMarinadeAdapter,
} from './yieldHarvester/protocols/marinade.js';

export {
  KaminoAdapter,
  getKaminoAdapter,
  resetKaminoAdapter,
} from './yieldHarvester/protocols/kamino.js';
