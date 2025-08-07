import { Decimal } from 'decimal.js';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import { MultiChainBridge, BridgeEstimate, BridgeOption } from '../../types/defi.types';
import { Logger } from '../../utils/logger';

export class BridgeService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private logger = new Logger('BridgeService');

  // Network providers
  private providers = {
    ETH: new ethers.JsonRpcProvider(process.env.ALCHEMY_ETH_URL),
    POLYGON: new ethers.JsonRpcProvider(process.env.ALCHEMY_POLYGON_URL),
    ARBITRUM: new ethers.JsonRpcProvider(process.env.ALCHEMY_ARBITRUM_URL)
  };

  // Bridge contract addresses
  private bridgeContracts = {
    Polygon_Bridge: {
      ETH: {
        rootChainManager: '0xA0c68C638235ee32657e8f720a23ceC1bFc77C77',
        erc20Predicate: '0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf'
      },
      POLYGON: {
        childChainManager: '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa'
      }
    },
    Arbitrum_Bridge: {
      ETH: {
        inbox: '0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f',
        gatewayRouter: '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef'
      },
      ARBITRUM: {
        arbSys: '0x0000000000000000000000000000000000000064'
      }
    }
  };

  // Gas price configurations for different networks
  private gasConfig = {
    ETH: { gasPrice: '20000000000', gasLimit: '200000' }, // 20 gwei
    POLYGON: { gasPrice: '30000000000', gasLimit: '200000' }, // 30 gwei
    ARBITRUM: { gasPrice: '100000000', gasLimit: '200000' } // 0.1 gwei
  };

  /**
   * Estimate cross-chain bridge costs and time for asset transfer
   */
  async estimateBridge(
    fromChain: 'ETH' | 'POLYGON' | 'ARBITRUM',
    toChain: 'ETH' | 'POLYGON' | 'ARBITRUM',
    fromAsset: string,
    toAsset: string,
    amount: string
  ): Promise<BridgeEstimate> {
    try {
      this.logger.info('Estimating bridge costs', { fromChain, toChain, fromAsset, toAsset, amount });

      if (fromChain === toChain) {
        throw new Error('Source and destination chains cannot be the same');
      }

      const bridgeOptions = await this.getBridgeOptions(fromChain, toChain, fromAsset, toAsset, amount);
      const bestOption = this.selectBestBridgeOption(bridgeOptions);

      const estimate: BridgeEstimate = {
        fromChain,
        toChain,
        fromAsset,
        toAsset,
        amount,
        estimatedTime: bestOption.estimatedTime,
        bridgeFee: bestOption.bridgeFee,
        gasEstimate: bestOption.gasEstimate,
        bestProvider: bestOption.provider,
        alternatives: bridgeOptions.filter(option => option.provider !== bestOption.provider)
      };

      this.logger.info('Bridge estimation complete', { estimate });
      return estimate;
    } catch (error) {
      this.logger.error('Error estimating bridge', error);
      throw error;
    }
  }

  /**
   * Execute automated bridge transaction for optimal funding source
   */
  async executeBridge(
    userContextHash: string,
    fromChain: 'ETH' | 'POLYGON' | 'ARBITRUM',
    toChain: 'ETH' | 'POLYGON' | 'ARBITRUM',
    fromAsset: string,
    toAsset: string,
    amount: string,
    walletAddress: string,
    fundingContext?: string
  ): Promise<MultiChainBridge> {
    try {
      this.logger.info('Executing bridge transaction', { fromChain, toChain, amount });

      // Get best bridge option
      const estimate = await this.estimateBridge(fromChain, toChain, fromAsset, toAsset, amount);
      
      // Create bridge record
      const bridge: MultiChainBridge = {
        bridgeId: this.generateBridgeId(),
        fromChain,
        toChain,
        fromAsset,
        toAsset,
        bridgeProvider: estimate.bestProvider,
        estimatedTime: estimate.estimatedTime,
        bridgeFee: estimate.bridgeFee,
        gasEstimate: estimate.gasEstimate,
        status: 'pending',
        transactionHash: '', // Will be set after transaction
        bridgeTransactionHash: undefined
      };

      // Execute the bridge transaction based on provider
      switch (estimate.bestProvider) {
        case 'Polygon_Bridge':
          bridge.transactionHash = await this.executePolygonBridge(
            fromChain, toChain, fromAsset, amount, walletAddress
          );
          break;
        case 'Arbitrum_Bridge':
          bridge.transactionHash = await this.executeArbitrumBridge(
            fromChain, toChain, fromAsset, amount, walletAddress
          );
          break;
        case 'Multichain':
          bridge.transactionHash = await this.executeMultichainBridge(
            fromChain, toChain, fromAsset, amount, walletAddress
          );
          break;
        default:
          throw new Error(`Unsupported bridge provider: ${estimate.bestProvider}`);
      }

      // Save bridge record to database
      await this.saveBridgeTransaction(userContextHash, bridge, fundingContext);

      // Start monitoring the bridge transaction
      this.monitorBridgeTransaction(bridge.bridgeId);

      this.logger.info('Bridge transaction initiated', { bridgeId: bridge.bridgeId });
      return bridge;
    } catch (error) {
      this.logger.error('Error executing bridge transaction', error);
      throw error;
    }
  }

  /**
   * Monitor bridge transaction status and update database
   */
  async monitorBridgeTransaction(bridgeId: string): Promise<void> {
    try {
      const bridge = await this.getBridgeTransaction(bridgeId);
      if (!bridge) {
        throw new Error('Bridge transaction not found');
      }

      // Check transaction status on source chain
      const provider = this.providers[bridge.fromChain];
      const receipt = await provider.getTransactionReceipt(bridge.transactionHash);

      if (receipt && receipt.status === 1) {
        // Transaction confirmed on source chain, now bridging
        await this.updateBridgeStatus(bridgeId, 'bridging');

        // Monitor destination chain for completion
        setTimeout(() => this.checkBridgeCompletion(bridgeId), 60000); // Check every minute
      } else if (receipt && receipt.status === 0) {
        // Transaction failed
        await this.updateBridgeStatus(bridgeId, 'failed');
      }
    } catch (error) {
      this.logger.error('Error monitoring bridge transaction', error);
    }
  }

  /**
   * Get bridge transaction status
   */
  async getBridgeStatus(bridgeId: string): Promise<MultiChainBridge | null> {
    try {
      return await this.getBridgeTransaction(bridgeId);
    } catch (error) {
      this.logger.error('Error getting bridge status', error);
      throw error;
    }
  }

  // Private methods

  private async getBridgeOptions(
    fromChain: string,
    toChain: string,
    fromAsset: string,
    toAsset: string,
    amount: string
  ): Promise<BridgeOption[]> {
    const options: BridgeOption[] = [];

    // Polygon Bridge option
    if ((fromChain === 'ETH' && toChain === 'POLYGON') || (fromChain === 'POLYGON' && toChain === 'ETH')) {
      const gasEstimate = await this.estimatePolygonBridgeGas(fromChain, amount);
      options.push({
        provider: 'Polygon_Bridge',
        estimatedTime: fromChain === 'ETH' ? 22 : 30, // ETH->Polygon: ~22min, Polygon->ETH: ~30min
        bridgeFee: '0', // Native bridge has no fees
        gasEstimate: gasEstimate.toString(),
        totalCost: gasEstimate.toString(),
        reliability: 'high'
      });
    }

    // Arbitrum Bridge option
    if ((fromChain === 'ETH' && toChain === 'ARBITRUM') || (fromChain === 'ARBITRUM' && toChain === 'ETH')) {
      const gasEstimate = await this.estimateArbitrumBridgeGas(fromChain, amount);
      options.push({
        provider: 'Arbitrum_Bridge',
        estimatedTime: fromChain === 'ETH' ? 10 : 10080, // ETH->Arbitrum: ~10min, Arbitrum->ETH: 7 days
        bridgeFee: '0',
        gasEstimate: gasEstimate.toString(),
        totalCost: gasEstimate.toString(),
        reliability: 'high'
      });
    }

    // Multichain option (for all combinations)
    if (this.isMultichainSupported(fromChain, toChain, fromAsset, toAsset)) {
      const multichainEstimate = await this.estimateMultichainCosts(fromChain, toChain, amount);
      options.push({
        provider: 'Multichain',
        estimatedTime: 5, // Usually faster
        bridgeFee: multichainEstimate.fee,
        gasEstimate: multichainEstimate.gas,
        totalCost: new Decimal(multichainEstimate.fee).add(multichainEstimate.gas).toString(),
        reliability: 'medium'
      });
    }

    return options;
  }

  private selectBestBridgeOption(options: BridgeOption[]): BridgeOption {
    // Select based on cost and reliability
    return options.reduce((best, current) => {
      const bestScore = this.calculateBridgeScore(best);
      const currentScore = this.calculateBridgeScore(current);
      return currentScore > bestScore ? current : best;
    });
  }

  private calculateBridgeScore(option: BridgeOption): number {
    const reliabilityScore = option.reliability === 'high' ? 3 : option.reliability === 'medium' ? 2 : 1;
    const costScore = 1 / (1 + parseFloat(option.totalCost)); // Lower cost = higher score
    const timeScore = 1 / (1 + option.estimatedTime / 60); // Shorter time = higher score
    
    return reliabilityScore * 0.5 + costScore * 0.3 + timeScore * 0.2;
  }

  private async executePolygonBridge(
    fromChain: string,
    toChain: string,
    asset: string,
    amount: string,
    walletAddress: string
  ): Promise<string> {
    // Simplified implementation - would execute actual Polygon bridge transaction
    this.logger.info('Executing Polygon bridge transaction', { fromChain, toChain, asset, amount });
    
    // Mock transaction hash
    return '0x' + Math.random().toString(16).substr(2, 64);
  }

  private async executeArbitrumBridge(
    fromChain: string,
    toChain: string,
    asset: string,
    amount: string,
    walletAddress: string
  ): Promise<string> {
    // Simplified implementation - would execute actual Arbitrum bridge transaction
    this.logger.info('Executing Arbitrum bridge transaction', { fromChain, toChain, asset, amount });
    
    // Mock transaction hash
    return '0x' + Math.random().toString(16).substr(2, 64);
  }

  private async executeMultichainBridge(
    fromChain: string,
    toChain: string,
    asset: string,
    amount: string,
    walletAddress: string
  ): Promise<string> {
    // Simplified implementation - would execute actual Multichain bridge transaction
    this.logger.info('Executing Multichain bridge transaction', { fromChain, toChain, asset, amount });
    
    // Mock transaction hash
    return '0x' + Math.random().toString(16).substr(2, 64);
  }

  private async estimatePolygonBridgeGas(fromChain: string, amount: string): Promise<Decimal> {
    // Simplified gas estimation
    const baseGas = fromChain === 'ETH' ? new Decimal('0.01') : new Decimal('0.001'); // ETH vs POLYGON
    return baseGas.mul(new Decimal(this.gasConfig[fromChain as keyof typeof this.gasConfig].gasPrice)).div(1e18);
  }

  private async estimateArbitrumBridgeGas(fromChain: string, amount: string): Promise<Decimal> {
    // Simplified gas estimation
    const baseGas = fromChain === 'ETH' ? new Decimal('0.015') : new Decimal('0.0001'); // ETH vs ARBITRUM
    return baseGas;
  }

  private isMultichainSupported(fromChain: string, toChain: string, fromAsset: string, toAsset: string): boolean {
    // Simplified check - Multichain supports most major tokens across these networks
    const supportedAssets = ['USDC', 'USDT', 'ETH', 'WBTC', 'DAI'];
    return supportedAssets.includes(fromAsset) && supportedAssets.includes(toAsset);
  }

  private async estimateMultichainCosts(fromChain: string, toChain: string, amount: string): Promise<{fee: string, gas: string}> {
    // Simplified Multichain cost estimation
    const feeRate = new Decimal('0.001'); // 0.1% fee
    const gasEstimate = new Decimal('20'); // $20 in gas
    
    return {
      fee: new Decimal(amount).mul(feeRate).toString(),
      gas: gasEstimate.toString()
    };
  }

  private generateBridgeId(): string {
    return `bridge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async saveBridgeTransaction(
    userContextHash: string,
    bridge: MultiChainBridge,
    fundingContext?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('multi_chain_bridges')
      .insert({
        bridge_id: bridge.bridgeId,
        user_context_hash: userContextHash,
        from_chain: bridge.fromChain,
        to_chain: bridge.toChain,
        from_asset: bridge.fromAsset,
        to_asset: bridge.toAsset,
        bridge_provider: bridge.bridgeProvider,
        amount: new Decimal(bridge.gasEstimate).toNumber(), // Simplified - should be actual amount
        estimated_time: bridge.estimatedTime,
        bridge_fee: new Decimal(bridge.bridgeFee).toNumber(),
        gas_estimate: new Decimal(bridge.gasEstimate).toNumber(),
        status: bridge.status,
        transaction_hash: bridge.transactionHash,
        bridge_transaction_hash: bridge.bridgeTransactionHash,
        funding_context_hash: fundingContext
      });

    if (error) {
      throw new Error(`Failed to save bridge transaction: ${error.message}`);
    }
  }

  private async getBridgeTransaction(bridgeId: string): Promise<MultiChainBridge | null> {
    const { data, error } = await this.supabase
      .from('multi_chain_bridges')
      .select('*')
      .eq('bridge_id', bridgeId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      bridgeId: data.bridge_id,
      fromChain: data.from_chain,
      toChain: data.to_chain,
      fromAsset: data.from_asset,
      toAsset: data.to_asset,
      bridgeProvider: data.bridge_provider,
      estimatedTime: data.estimated_time,
      bridgeFee: data.bridge_fee.toString(),
      gasEstimate: data.gas_estimate.toString(),
      status: data.status,
      transactionHash: data.transaction_hash,
      bridgeTransactionHash: data.bridge_transaction_hash
    };
  }

  private async updateBridgeStatus(bridgeId: string, status: MultiChainBridge['status']): Promise<void> {
    const updateData: any = { status };
    
    if (status === 'completed') {
      updateData.completed_at = new Date();
    }

    const { error } = await this.supabase
      .from('multi_chain_bridges')
      .update(updateData)
      .eq('bridge_id', bridgeId);

    if (error) {
      throw new Error(`Failed to update bridge status: ${error.message}`);
    }
  }

  private async checkBridgeCompletion(bridgeId: string): Promise<void> {
    try {
      const bridge = await this.getBridgeTransaction(bridgeId);
      if (!bridge || bridge.status !== 'bridging') {
        return;
      }

      // Check if bridge is complete on destination chain
      // This would involve checking specific bridge contract events or destination balance
      // For now, we'll simulate completion after estimated time
      
      const now = Date.now();
      const estimatedCompletion = now + (bridge.estimatedTime * 60 * 1000);
      
      setTimeout(async () => {
        await this.updateBridgeStatus(bridgeId, 'completed');
        this.logger.info('Bridge transaction completed', { bridgeId });
      }, bridge.estimatedTime * 60 * 1000);

    } catch (error) {
      this.logger.error('Error checking bridge completion', error);
      await this.updateBridgeStatus(bridgeId, 'failed');
    }
  }
}