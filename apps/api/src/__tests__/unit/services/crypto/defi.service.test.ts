import { DeFiService } from '../../../../services/crypto/defi.service';
import { DeFiPosition } from '../../../../types/defi.types';

// Mock dependencies
jest.mock('@supabase/supabase-js');
jest.mock('ethers');
jest.mock('decimal.js');

describe('DeFiService', () => {
  let defiService: DeFiService;
  const mockUserContextHash = 'test-user-context-hash';
  const mockWalletAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    jest.clearAllMocks();
    defiService = new DeFiService();
  });

  describe('getDeFiPositions', () => {
    it('should retrieve DeFi positions for a user', async () => {
      const mockPositions = [
        {
          position_id: 'pos-1',
          protocol_name: 'Aave',
          network_type: 'ETH',
          position_type: 'lending',
          underlying_assets: [{ asset: 'USDC', amount: '1000', usdValue: '1000', weight: 100 }],
          current_yield: 3.5,
          total_value_locked: 1000,
          available_for_funding: 1000,
          risk_level: 'low',
          created_at: new Date(),
          last_updated: new Date()
        }
      ];

      // Mock Supabase response
      (defiService as any).supabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: mockPositions, error: null })
            })
          })
        })
      };

      const result = await defiService.getDeFiPositions(mockUserContextHash);

      expect(result).toHaveLength(1);
      expect(result[0].protocolName).toBe('Aave');
      expect(result[0].networkType).toBe('ETH');
    });

    it('should handle database errors gracefully', async () => {
      (defiService as any).supabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } })
            })
          })
        })
      };

      await expect(defiService.getDeFiPositions(mockUserContextHash))
        .rejects
        .toThrow('Failed to retrieve DeFi positions: Database error');
    });
  });

  describe('syncAavePositions', () => {
    it('should sync Aave positions from blockchain', async () => {
      // Mock ethers provider and contract
      const mockContract = {
        getUserAccountData: jest.fn().mockResolvedValue({
          totalCollateralBase: BigInt('1000000000000000000000'), // 1000 ETH in wei
          totalDebtBase: BigInt('0'),
          availableBorrowsBase: BigInt('800000000000000000000'), // 800 ETH
          healthFactor: BigInt('2000000000000000000') // 2.0
        })
      };

      // Mock providers
      (defiService as any).providers = {
        ETH: {
          getContract: jest.fn().mockReturnValue(mockContract)
        }
      };

      // Mock Supabase upsert
      (defiService as any).supabase = {
        from: jest.fn().mockReturnValue({
          upsert: jest.fn().mockResolvedValue({ error: null })
        })
      };

      // Mock private methods
      jest.spyOn(defiService as any, 'getAaveAssets').mockResolvedValue([
        { asset: 'ETH', amount: '1.0', usdValue: '2000.0', weight: 100 }
      ]);
      jest.spyOn(defiService as any, 'getAaveYield').mockResolvedValue('3.5');
      jest.spyOn(defiService as any, 'saveDeFiPosition').mockResolvedValue(undefined);

      const positions = await defiService.syncAavePositions(mockUserContextHash, mockWalletAddress);

      expect(positions).toHaveLength(3); // ETH, POLYGON, ARBITRUM
      expect(positions[0].protocolName).toBe('Aave');
      expect(positions[0].riskLevel).toBe('low'); // Health factor of 2.0 = low risk
    });

    it('should handle zero collateral positions', async () => {
      const mockContract = {
        getUserAccountData: jest.fn().mockResolvedValue({
          totalCollateralBase: BigInt('0'),
          totalDebtBase: BigInt('0'),
          availableBorrowsBase: BigInt('0'),
          healthFactor: BigInt('0')
        })
      };

      (defiService as any).providers = {
        ETH: { getContract: jest.fn().mockReturnValue(mockContract) },
        POLYGON: { getContract: jest.fn().mockReturnValue(mockContract) },
        ARBITRUM: { getContract: jest.fn().mockReturnValue(mockContract) }
      };

      const positions = await defiService.syncAavePositions(mockUserContextHash, mockWalletAddress);

      expect(positions).toHaveLength(0); // No positions with zero collateral
    });
  });

  describe('syncCompoundPositions', () => {
    it('should sync Compound positions from blockchain', async () => {
      const mockContract = {
        balanceOf: jest.fn().mockResolvedValue(BigInt('1000000000')), // 1000 cUSDC
        exchangeRateStored: jest.fn().mockResolvedValue(BigInt('200000000000000000')) // 0.02 USDC per cUSDC
      };

      (defiService as any).providers = {
        ETH: {
          getContract: jest.fn().mockReturnValue(mockContract)
        }
      };

      (defiService as any).supabase = {
        from: jest.fn().mockReturnValue({
          upsert: jest.fn().mockResolvedValue({ error: null })
        })
      };

      jest.spyOn(defiService as any, 'getCompoundYield').mockResolvedValue('2.8');
      jest.spyOn(defiService as any, 'saveDeFiPosition').mockResolvedValue(undefined);

      const positions = await defiService.syncCompoundPositions(mockUserContextHash, mockWalletAddress);

      expect(positions).toHaveLength(1);
      expect(positions[0].protocolName).toBe('Compound');
      expect(positions[0].networkType).toBe('ETH');
    });
  });

  describe('generateYieldOptimizations', () => {
    it('should generate yield optimization recommendations', async () => {
      const mockPositions: DeFiPosition[] = [
        {
          positionId: 'pos-1',
          protocolName: 'Aave',
          networkType: 'ETH',
          positionType: 'lending',
          underlyingAssets: [],
          currentYield: '2.5',
          totalValueLocked: '10000',
          availableForFunding: '10000',
          riskLevel: 'low',
          createdAt: new Date(),
          lastUpdated: new Date()
        }
      ];

      jest.spyOn(defiService, 'getDeFiPositions').mockResolvedValue(mockPositions);
      jest.spyOn(defiService as any, 'findBetterYieldOptions').mockResolvedValue([
        {
          ...mockPositions[0],
          positionId: 'alt-pos-1',
          protocolName: 'Compound',
          currentYield: '3.5'
        }
      ]);
      jest.spyOn(defiService as any, 'estimateRebalanceGas').mockResolvedValue({ toString: () => '50' });
      jest.spyOn(defiService as any, 'saveYieldOptimization').mockResolvedValue(undefined);

      const optimizations = await defiService.generateYieldOptimizations(mockUserContextHash);

      expect(optimizations).toHaveLength(1);
      expect(parseFloat(optimizations[0].yieldImprovement)).toBe(1.0); // 3.5 - 2.5 = 1.0
    });

    it('should filter out optimizations with insufficient yield improvement', async () => {
      const mockPositions: DeFiPosition[] = [
        {
          positionId: 'pos-1',
          protocolName: 'Aave',
          networkType: 'ETH',
          positionType: 'lending',
          underlyingAssets: [],
          currentYield: '3.0',
          totalValueLocked: '1000', // Small position
          availableForFunding: '1000',
          riskLevel: 'low',
          createdAt: new Date(),
          lastUpdated: new Date()
        }
      ];

      jest.spyOn(defiService, 'getDeFiPositions').mockResolvedValue(mockPositions);
      jest.spyOn(defiService as any, 'findBetterYieldOptions').mockResolvedValue([
        {
          ...mockPositions[0],
          positionId: 'alt-pos-1',
          protocolName: 'Compound',
          currentYield: '3.1' // Only 0.1% improvement
        }
      ]);
      jest.spyOn(defiService as any, 'estimateRebalanceGas').mockResolvedValue({ toString: () => '100' }); // High gas cost

      const optimizations = await defiService.generateYieldOptimizations(mockUserContextHash);

      expect(optimizations).toHaveLength(0); // Filtered out due to low yield improvement vs gas cost
    });
  });

  describe('fundFromDeFiPosition', () => {
    it('should successfully fund card from DeFi position', async () => {
      const mockPosition: DeFiPosition = {
        positionId: 'pos-1',
        protocolName: 'Aave',
        networkType: 'ETH',
        positionType: 'lending',
        underlyingAssets: [],
        currentYield: '3.5',
        totalValueLocked: '10000',
        availableForFunding: '5000',
        riskLevel: 'low',
        createdAt: new Date(),
        lastUpdated: new Date()
      };

      jest.spyOn(defiService as any, 'getDeFiPosition').mockResolvedValue(mockPosition);
      jest.spyOn(defiService as any, 'executeAaveWithdrawal').mockResolvedValue('0xabc123');
      jest.spyOn(defiService as any, 'updatePositionAfterFunding').mockResolvedValue(undefined);

      const result = await defiService.fundFromDeFiPosition(
        mockUserContextHash,
        'pos-1',
        '1000',
        'card-context'
      );

      expect(result.transactionHash).toBe('0xabc123');
      expect(result.status).toBe('pending');
    });

    it('should reject funding request exceeding available amount', async () => {
      const mockPosition: DeFiPosition = {
        positionId: 'pos-1',
        protocolName: 'Aave',
        networkType: 'ETH',
        positionType: 'lending',
        underlyingAssets: [],
        currentYield: '3.5',
        totalValueLocked: '10000',
        availableForFunding: '500', // Only $500 available
        riskLevel: 'low',
        createdAt: new Date(),
        lastUpdated: new Date()
      };

      jest.spyOn(defiService as any, 'getDeFiPosition').mockResolvedValue(mockPosition);

      await expect(defiService.fundFromDeFiPosition(
        mockUserContextHash,
        'pos-1',
        '1000', // Requesting $1000 but only $500 available
        'card-context'
      )).rejects.toThrow('Insufficient funds available in DeFi position');
    });

    it('should handle non-existent position', async () => {
      jest.spyOn(defiService as any, 'getDeFiPosition').mockResolvedValue(null);

      await expect(defiService.fundFromDeFiPosition(
        mockUserContextHash,
        'non-existent-pos',
        '1000',
        'card-context'
      )).rejects.toThrow('DeFi position not found');
    });
  });
});