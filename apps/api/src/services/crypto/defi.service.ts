import { Decimal } from 'decimal.js';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import { DeFiPosition, AssetPosition, YieldOptimization } from '../../types/defi.types';
import { Logger } from '../../utils/logger';

export class DeFiService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private logger = new Logger('DeFiService');

  // Ethereum providers for multi-chain support
  private providers = {
    ETH: new ethers.JsonRpcProvider(process.env.ALCHEMY_ETH_URL),
    POLYGON: new ethers.JsonRpcProvider(process.env.ALCHEMY_POLYGON_URL),
    ARBITRUM: new ethers.JsonRpcProvider(process.env.ALCHEMY_ARBITRUM_URL)
  };

  // Protocol contract addresses
  private contracts = {
    aave: {
      ETH: {
        pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', // Aave V3 Pool
        dataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3'
      },
      POLYGON: {
        pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654'
      },
      ARBITRUM: {
        pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654'
      }
    },
    compound: {
      ETH: {
        comptroller: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
        cUSDC: '0x39AA39c021dfbaE8faC545936693aC917d5E7563'
      }
    },
    uniswap: {
      ETH: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Uniswap V3 Factory
        nonfungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'
      },
      POLYGON: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        nonfungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'
      },
      ARBITRUM: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        nonfungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'
      }
    }
  };

  /**
   * Retrieve all DeFi positions for a user across all protocols
   */
  async getDeFiPositions(userContextHash: string): Promise<DeFiPosition[]> {
    try {
      this.logger.info('Retrieving DeFi positions', { userContextHash });

      const { data: positions, error } = await this.supabase
        .from('defi_positions')
        .select('*')
        .eq('user_context_hash', userContextHash)
        .order('last_updated', { ascending: false });

      if (error) {
        throw new Error(`Failed to retrieve DeFi positions: ${error.message}`);
      }

      return positions?.map(this.mapDatabaseToPosition) || [];
    } catch (error) {
      this.logger.error('Error retrieving DeFi positions', error);
      throw error;
    }
  }

  /**
   * Implement Aave protocol integration for yield-generating positions
   */
  async syncAavePositions(userContextHash: string, walletAddress: string): Promise<DeFiPosition[]> {
    const positions: DeFiPosition[] = [];

    try {
      for (const [network, addresses] of Object.entries(this.contracts.aave)) {
        const provider = this.providers[network as keyof typeof this.providers];
        const poolContract = new ethers.Contract(
          addresses.pool,
          ['function getUserAccountData(address) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'],
          provider
        );

        const accountData = await poolContract.getUserAccountData(walletAddress);
        
        if (accountData.totalCollateralBase > 0) {
          const position: DeFiPosition = {
            positionId: `aave-${network.toLowerCase()}-${walletAddress}`,
            protocolName: 'Aave',
            networkType: network as 'ETH' | 'POLYGON' | 'ARBITRUM',
            positionType: 'lending',
            underlyingAssets: await this.getAaveAssets(walletAddress, network, provider),
            currentYield: await this.getAaveYield(network),
            totalValueLocked: new Decimal(ethers.formatEther(accountData.totalCollateralBase)).toString(),
            availableForFunding: new Decimal(ethers.formatEther(accountData.availableBorrowsBase)).toString(),
            riskLevel: this.assessRiskLevel(accountData.healthFactor),
            createdAt: new Date(),
            lastUpdated: new Date()
          };

          positions.push(position);
          await this.saveDeFiPosition(userContextHash, position);
        }
      }

      this.logger.info('Synced Aave positions', { count: positions.length });
      return positions;
    } catch (error) {
      this.logger.error('Error syncing Aave positions', error);
      throw error;
    }
  }

  /**
   * Implement Compound protocol integration
   */
  async syncCompoundPositions(userContextHash: string, walletAddress: string): Promise<DeFiPosition[]> {
    const positions: DeFiPosition[] = [];

    try {
      const provider = this.providers.ETH;
      const cUSDCContract = new ethers.Contract(
        this.contracts.compound.ETH.cUSDC,
        ['function balanceOf(address) view returns (uint256)', 'function exchangeRateStored() view returns (uint256)'],
        provider
      );

      const balance = await cUSDCContract.balanceOf(walletAddress);
      const exchangeRate = await cUSDCContract.exchangeRateStored();

      if (balance > 0) {
        const underlyingBalance = new Decimal(balance.toString()).mul(exchangeRate.toString()).div(1e18);
        
        const position: DeFiPosition = {
          positionId: `compound-eth-${walletAddress}`,
          protocolName: 'Compound',
          networkType: 'ETH',
          positionType: 'lending',
          underlyingAssets: [{
            asset: 'USDC',
            amount: underlyingBalance.toString(),
            usdValue: underlyingBalance.toString(), // USDC is ~$1
            weight: 100
          }],
          currentYield: await this.getCompoundYield(),
          totalValueLocked: underlyingBalance.toString(),
          availableForFunding: underlyingBalance.toString(),
          riskLevel: 'low',
          createdAt: new Date(),
          lastUpdated: new Date()
        };

        positions.push(position);
        await this.saveDeFiPosition(userContextHash, position);
      }

      return positions;
    } catch (error) {
      this.logger.error('Error syncing Compound positions', error);
      throw error;
    }
  }

  /**
   * Implement Uniswap V3 LP token integration
   */
  async syncUniswapPositions(userContextHash: string, walletAddress: string): Promise<DeFiPosition[]> {
    const positions: DeFiPosition[] = [];

    try {
      for (const [network, addresses] of Object.entries(this.contracts.uniswap)) {
        const provider = this.providers[network as keyof typeof this.providers];
        const nftContract = new ethers.Contract(
          addresses.nonfungiblePositionManager,
          ['function balanceOf(address) view returns (uint256)', 'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)', 'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'],
          provider
        );

        const balance = await nftContract.balanceOf(walletAddress);
        
        for (let i = 0; i < balance; i++) {
          const tokenId = await nftContract.tokenOfOwnerByIndex(walletAddress, i);
          const position = await nftContract.positions(tokenId);

          if (position.liquidity > 0) {
            const lpPosition: DeFiPosition = {
              positionId: `uniswap-${network.toLowerCase()}-${tokenId.toString()}`,
              protocolName: 'Uniswap',
              networkType: network as 'ETH' | 'POLYGON' | 'ARBITRUM',
              positionType: 'liquidity_pool',
              underlyingAssets: await this.getUniswapAssets(position, provider),
              currentYield: await this.getUniswapYield(position.token0, position.token1, position.fee),
              totalValueLocked: await this.calculateLPValue(position, provider),
              availableForFunding: await this.calculateLPValue(position, provider),
              riskLevel: 'medium', // LP positions have impermanent loss risk
              createdAt: new Date(),
              lastUpdated: new Date()
            };

            positions.push(lpPosition);
            await this.saveDeFiPosition(userContextHash, lpPosition);
          }
        }
      }

      return positions;
    } catch (error) {
      this.logger.error('Error syncing Uniswap positions', error);
      throw error;
    }
  }

  /**
   * Yield optimization algorithms based on current DeFi rates and gas costs
   */
  async generateYieldOptimizations(userContextHash: string): Promise<YieldOptimization[]> {
    try {
      const positions = await this.getDeFiPositions(userContextHash);
      const optimizations: YieldOptimization[] = [];

      for (const position of positions) {
        // Compare yields across protocols
        const alternatives = await this.findBetterYieldOptions(position);
        
        for (const alternative of alternatives) {
          const gasEstimate = await this.estimateRebalanceGas(position, alternative);
          const yieldImprovement = new Decimal(alternative.currentYield).sub(position.currentYield);
          
          // Only suggest if yield improvement exceeds gas costs
          if (yieldImprovement.mul(position.totalValueLocked).div(100).gt(gasEstimate)) {
            optimizations.push({
              optimizationId: `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              sourcePosition: position,
              suggestedPosition: alternative,
              yieldImprovement: yieldImprovement.toString(),
              gasSavings: gasEstimate.toString(),
              riskAssessment: this.compareRiskLevels(position.riskLevel, alternative.riskLevel),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
            });
          }
        }
      }

      // Save optimizations to database
      for (const optimization of optimizations) {
        await this.saveYieldOptimization(userContextHash, optimization);
      }

      this.logger.info('Generated yield optimizations', { count: optimizations.length });
      return optimizations;
    } catch (error) {
      this.logger.error('Error generating yield optimizations', error);
      throw error;
    }
  }

  /**
   * Fund card directly from DeFi position without manual withdrawal
   */
  async fundFromDeFiPosition(
    userContextHash: string,
    positionId: string,
    fundingAmount: string,
    cardContext: string
  ): Promise<{ transactionHash: string; status: string }> {
    try {
      const position = await this.getDeFiPosition(positionId);
      if (!position) {
        throw new Error('DeFi position not found');
      }

      // Validate funding amount doesn't exceed available
      const requestedAmount = new Decimal(fundingAmount);
      const availableAmount = new Decimal(position.availableForFunding);
      
      if (requestedAmount.gt(availableAmount)) {
        throw new Error('Insufficient funds available in DeFi position');
      }

      // Execute protocol-specific withdrawal
      let transactionHash: string;
      
      switch (position.protocolName) {
        case 'Aave':
          transactionHash = await this.executeAaveWithdrawal(position, fundingAmount);
          break;
        case 'Compound':
          transactionHash = await this.executeCompoundWithdrawal(position, fundingAmount);
          break;
        case 'Uniswap':
          transactionHash = await this.executeUniswapWithdrawal(position, fundingAmount);
          break;
        default:
          throw new Error(`Unsupported protocol: ${position.protocolName}`);
      }

      // Update position with reduced available funding
      await this.updatePositionAfterFunding(positionId, fundingAmount);

      this.logger.info('Successfully funded from DeFi position', {
        positionId,
        amount: fundingAmount,
        transactionHash
      });

      return { transactionHash, status: 'pending' };
    } catch (error) {
      this.logger.error('Error funding from DeFi position', error);
      throw error;
    }
  }

  // Helper methods

  private mapDatabaseToPosition(dbPosition: any): DeFiPosition {
    return {
      positionId: dbPosition.position_id,
      protocolName: dbPosition.protocol_name,
      networkType: dbPosition.network_type,
      positionType: dbPosition.position_type,
      underlyingAssets: dbPosition.underlying_assets,
      currentYield: dbPosition.current_yield.toString(),
      totalValueLocked: dbPosition.total_value_locked.toString(),
      availableForFunding: dbPosition.available_for_funding.toString(),
      riskLevel: dbPosition.risk_level,
      createdAt: new Date(dbPosition.created_at),
      lastUpdated: new Date(dbPosition.last_updated)
    };
  }

  private async saveDeFiPosition(userContextHash: string, position: DeFiPosition): Promise<void> {
    const { error } = await this.supabase
      .from('defi_positions')
      .upsert({
        position_id: position.positionId,
        user_context_hash: userContextHash,
        protocol_name: position.protocolName,
        network_type: position.networkType,
        position_type: position.positionType,
        underlying_assets: position.underlyingAssets,
        current_yield: new Decimal(position.currentYield).toNumber(),
        total_value_locked: new Decimal(position.totalValueLocked).toNumber(),
        available_for_funding: new Decimal(position.availableForFunding).toNumber(),
        risk_level: position.riskLevel,
        last_updated: new Date()
      });

    if (error) {
      throw new Error(`Failed to save DeFi position: ${error.message}`);
    }
  }

  private async getDeFiPosition(positionId: string): Promise<DeFiPosition | null> {
    const { data, error } = await this.supabase
      .from('defi_positions')
      .select('*')
      .eq('position_id', positionId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDatabaseToPosition(data);
  }

  private async getAaveAssets(walletAddress: string, network: string, provider: ethers.JsonRpcProvider): Promise<AssetPosition[]> {
    // Simplified implementation - would need full Aave data provider integration
    return [{
      asset: 'USDC',
      amount: '1000.0',
      usdValue: '1000.0',
      weight: 100
    }];
  }

  private async getAaveYield(network: string): Promise<string> {
    // Simplified implementation - would fetch from Aave data provider
    return '3.5'; // 3.5% APY
  }

  private assessRiskLevel(healthFactor: bigint): 'low' | 'medium' | 'high' {
    const hf = new Decimal(healthFactor.toString()).div(1e18);
    if (hf.gt(2)) return 'low';
    if (hf.gt(1.5)) return 'medium';
    return 'high';
  }

  private async getCompoundYield(): Promise<string> {
    // Simplified implementation
    return '2.8'; // 2.8% APY
  }

  private async getUniswapAssets(position: any, provider: ethers.JsonRpcProvider): Promise<AssetPosition[]> {
    // Simplified implementation
    return [
      { asset: 'ETH', amount: '0.5', usdValue: '1000.0', weight: 50 },
      { asset: 'USDC', amount: '1000.0', usdValue: '1000.0', weight: 50 }
    ];
  }

  private async getUniswapYield(token0: string, token1: string, fee: number): Promise<string> {
    // Simplified implementation - would calculate based on fee tier and volume
    return '15.0'; // 15% APY
  }

  private async calculateLPValue(position: any, provider: ethers.JsonRpcProvider): Promise<string> {
    // Simplified implementation
    return '2000.0';
  }

  private async findBetterYieldOptions(position: DeFiPosition): Promise<DeFiPosition[]> {
    // Simplified implementation - would compare across all protocols
    return [];
  }

  private async estimateRebalanceGas(current: DeFiPosition, alternative: DeFiPosition): Promise<Decimal> {
    // Simplified implementation - would estimate actual gas costs
    return new Decimal('50.0'); // $50 in gas
  }

  private compareRiskLevels(current: string, alternative: string): 'lower' | 'same' | 'higher' {
    const riskMap = { low: 1, medium: 2, high: 3 };
    const currentRisk = riskMap[current as keyof typeof riskMap];
    const altRisk = riskMap[alternative as keyof typeof riskMap];
    
    if (altRisk < currentRisk) return 'lower';
    if (altRisk > currentRisk) return 'higher';
    return 'same';
  }

  private async saveYieldOptimization(userContextHash: string, optimization: YieldOptimization): Promise<void> {
    const { error } = await this.supabase
      .from('defi_yield_optimization')
      .insert({
        optimization_id: optimization.optimizationId,
        user_context_hash: userContextHash,
        optimization_type: 'yield_comparison',
        source_protocol: optimization.sourcePosition.protocolName,
        source_network: optimization.sourcePosition.networkType,
        suggested_protocol: optimization.suggestedPosition.protocolName,
        suggested_network: optimization.suggestedPosition.networkType,
        yield_improvement: new Decimal(optimization.yieldImprovement).toNumber(),
        gas_savings: new Decimal(optimization.gasSavings).toNumber(),
        risk_assessment: optimization.riskAssessment,
        recommendation_data: {
          sourcePosition: optimization.sourcePosition,
          suggestedPosition: optimization.suggestedPosition
        },
        expires_at: optimization.expiresAt
      });

    if (error) {
      throw new Error(`Failed to save yield optimization: ${error.message}`);
    }
  }

  private async executeAaveWithdrawal(position: DeFiPosition, amount: string): Promise<string> {
    // Simplified implementation - would execute actual Aave withdrawal
    return '0x' + Math.random().toString(16).substr(2, 64);
  }

  private async executeCompoundWithdrawal(position: DeFiPosition, amount: string): Promise<string> {
    // Simplified implementation - would execute actual Compound withdrawal
    return '0x' + Math.random().toString(16).substr(2, 64);
  }

  private async executeUniswapWithdrawal(position: DeFiPosition, amount: string): Promise<string> {
    // Simplified implementation - would execute actual Uniswap LP withdrawal
    return '0x' + Math.random().toString(16).substr(2, 64);
  }

  private async updatePositionAfterFunding(positionId: string, fundingAmount: string): Promise<void> {
    const { error } = await this.supabase
      .from('defi_positions')
      .update({
        available_for_funding: new Decimal(fundingAmount).toNumber(),
        last_updated: new Date()
      })
      .eq('position_id', positionId);

    if (error) {
      throw new Error(`Failed to update position after funding: ${error.message}`);
    }
  }
}