// Shared types for mobile DeFi integration
export interface DeFiPosition {
  positionId: string; // UUID v4
  protocolName: 'Aave' | 'Compound' | 'Uniswap' | 'SushiSwap';
  networkType: 'ETH' | 'POLYGON' | 'ARBITRUM';
  positionType: 'lending' | 'liquidity_pool' | 'yield_farming';
  underlyingAssets: AssetPosition[];
  currentYield: string; // Decimal string for APY
  totalValueLocked: string; // USD value in decimal string
  availableForFunding: string; // USD value available for card funding
  riskLevel: 'low' | 'medium' | 'high';
  createdAt: Date;
  lastUpdated: Date;
}

export interface AssetPosition {
  asset: 'ETH' | 'USDC' | 'USDT' | 'DAI' | 'WBTC';
  amount: string; // Decimal string for precision
  usdValue: string; // Current USD value
  weight: number; // Position weight percentage
}

export interface YieldOptimization {
  optimizationId: string;
  sourcePosition: DeFiPosition;
  suggestedPosition: DeFiPosition;
  yieldImprovement: string; // Percentage improvement
  gasSavings: string; // USD cost
  riskAssessment: 'lower' | 'same' | 'higher';
  expiresAt: Date;
}

export interface MultiChainBridge {
  bridgeId: string; // UUID v4
  fromChain: 'ETH' | 'POLYGON' | 'ARBITRUM';
  toChain: 'ETH' | 'POLYGON' | 'ARBITRUM';
  fromAsset: string; // Asset on source chain
  toAsset: string; // Asset on destination chain
  bridgeProvider: 'Polygon_Bridge' | 'Arbitrum_Bridge' | 'Multichain';
  estimatedTime: number; // Minutes
  bridgeFee: string; // Fee in USD
  gasEstimate: string; // Gas cost estimate
  status: 'pending' | 'bridging' | 'completed' | 'failed';
  transactionHash: string; // Source chain tx hash
  bridgeTransactionHash?: string; // Bridge tx hash
}

export interface TransactionBatch {
  batchId: string; // UUID v4
  transactions: string[]; // Array of transaction IDs
  totalGasOptimization: string; // Gas savings in USD
  batchStatus: 'pending' | 'executing' | 'completed' | 'failed';
  estimatedCompletion: Date;
  createdAt: Date;
}

export interface BridgeEstimate {
  fromChain: 'ETH' | 'POLYGON' | 'ARBITRUM';
  toChain: 'ETH' | 'POLYGON' | 'ARBITRUM';
  fromAsset: string;
  toAsset: string;
  amount: string;
  estimatedTime: number;
  bridgeFee: string;
  gasEstimate: string;
  bestProvider: 'Polygon_Bridge' | 'Arbitrum_Bridge' | 'Multichain';
  alternatives: BridgeOption[];
}

export interface BridgeOption {
  provider: 'Polygon_Bridge' | 'Arbitrum_Bridge' | 'Multichain';
  estimatedTime: number;
  bridgeFee: string;
  gasEstimate: string;
  totalCost: string;
  reliability: 'high' | 'medium' | 'low';
}

export interface PortfolioImpactAnalysis {
  currentAllocation: AssetAllocation[];
  projectedAllocation: AssetAllocation[];
  riskImpact: {
    current: number;
    projected: number;
    change: number;
  };
  yieldImpact: {
    current: string;
    projected: string;
    change: string;
  };
  rebalanceRecommendations: RebalanceRecommendation[];
}

export interface AssetAllocation {
  asset: string;
  protocol: string;
  network: string;
  allocation: number; // Percentage
  value: string; // USD value
}

export interface RebalanceRecommendation {
  action: 'increase' | 'decrease' | 'maintain';
  asset: string;
  protocol: string;
  network: string;
  currentAllocation: number;
  recommendedAllocation: number;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

// WebSocket message types for real-time updates
export interface DeFiPositionUpdate {
  type: 'position_update';
  positionId: string;
  updates: Partial<DeFiPosition>;
}

export interface YieldOptimizationUpdate {
  type: 'yield_optimization';
  optimizations: YieldOptimization[];
}

export interface BridgeStatusUpdate {
  type: 'bridge_status';
  bridgeId: string;
  status: MultiChainBridge['status'];
  transactionHash?: string;
}

export type DeFiWebSocketMessage = 
  | DeFiPositionUpdate 
  | YieldOptimizationUpdate 
  | BridgeStatusUpdate;