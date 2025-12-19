/**
 * DeFi Type Definitions
 */

export interface DeFiPosition {
  id: string;
  positionId: string;
  userId: string;
  walletId: string;
  protocolName: string;
  protocolVersion?: string;
  networkType: string;
  positionType: 'lending' | 'borrowing' | 'liquidity_pool' | 'staking' | 'yield_farming';
  depositedAssets: Array<{
    symbol: string;
    amount: number;
    decimals: number;
  }>;
  totalValueUsd: number;
  depositedValueUsd: number;
  earnedValueUsd: number;
  availableForFunding: number;
  currentYieldApy: number;
  estimatedDailyYield: number;
  riskLevel: 'low' | 'medium' | 'high';
  healthFactor?: number;
  lastSyncedAt: string;
  createdAt: string;
}

export interface YieldOptimization {
  optimizationId: string;
  optimizationType: 'yield_comparison' | 'gas_optimization' | 'rebalance_suggestion';
  sourceProtocol: string;
  suggestedProtocol: string;
  sourceNetwork: string;
  suggestedNetwork: string;
  yieldImprovement: number;
  gasSavings: number;
  riskAssessment: 'lower' | 'same' | 'higher';
  recommendationData: any;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export interface BridgeEstimate {
  bridgeId: string;
  fromChain: string;
  toChain: string;
  fromAsset: string;
  toAsset: string;
  bridgeProvider: string;
  amount: number;
  estimatedTime: number;
  bridgeFee: number;
  gasEstimate: number;
  status: 'pending' | 'bridging' | 'completed' | 'failed';
}

export interface BridgeOption {
  provider: string;
  estimatedTime: number;
  fee: number;
  gasEstimate: number;
  recommended: boolean;
}
