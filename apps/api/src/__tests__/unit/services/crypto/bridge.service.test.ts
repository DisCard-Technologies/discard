import { BridgeService } from '../../../../services/crypto/bridge.service';
import { BridgeEstimate, MultiChainBridge } from '../../../../types/defi.types';

// Mock dependencies
jest.mock('@supabase/supabase-js');
jest.mock('ethers');
jest.mock('decimal.js');

describe('BridgeService', () => {
  let bridgeService: BridgeService;
  const mockUserContextHash = 'test-user-context-hash';
  const mockWalletAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    jest.clearAllMocks();
    bridgeService = new BridgeService();
  });

  describe('estimateBridge', () => {
    it('should estimate bridge costs for ETH to Polygon', async () => {
      jest.spyOn(bridgeService as any, 'getBridgeOptions').mockResolvedValue([
        {
          provider: 'Polygon_Bridge',
          estimatedTime: 22,
          bridgeFee: '0',
          gasEstimate: '50',
          totalCost: '50',
          reliability: 'high'
        },
        {
          provider: 'Multichain',
          estimatedTime: 5,
          bridgeFee: '10',
          gasEstimate: '20',
          totalCost: '30',
          reliability: 'medium'
        }
      ]);

      const estimate = await bridgeService.estimateBridge('ETH', 'POLYGON', 'USDC', 'USDC', '1000');

      expect(estimate.fromChain).toBe('ETH');
      expect(estimate.toChain).toBe('POLYGON');
      expect(estimate.bestProvider).toBe('Polygon_Bridge'); // Should select based on score
      expect(estimate.alternatives).toHaveLength(1);
    });

    it('should throw error for same source and destination chains', async () => {
      await expect(
        bridgeService.estimateBridge('ETH', 'ETH', 'USDC', 'USDC', '1000')
      ).rejects.toThrow('Source and destination chains cannot be the same');
    });

    it('should return empty alternatives when only one option available', async () => {
      jest.spyOn(bridgeService as any, 'getBridgeOptions').mockResolvedValue([
        {
          provider: 'Polygon_Bridge',
          estimatedTime: 22,
          bridgeFee: '0',
          gasEstimate: '50',
          totalCost: '50',
          reliability: 'high'
        }
      ]);

      const estimate = await bridgeService.estimateBridge('ETH', 'POLYGON', 'USDC', 'USDC', '1000');

      expect(estimate.alternatives).toHaveLength(0);
    });
  });

  describe('executeBridge', () => {
    it('should execute Polygon bridge transaction', async () => {
      const mockEstimate: BridgeEstimate = {
        fromChain: 'ETH',
        toChain: 'POLYGON',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        amount: '1000',
        estimatedTime: 22,
        bridgeFee: '0',
        gasEstimate: '50',
        bestProvider: 'Polygon_Bridge',
        alternatives: []
      };

      jest.spyOn(bridgeService, 'estimateBridge').mockResolvedValue(mockEstimate);
      jest.spyOn(bridgeService as any, 'executePolygonBridge').mockResolvedValue('0xabc123');
      jest.spyOn(bridgeService as any, 'saveBridgeTransaction').mockResolvedValue(undefined);
      jest.spyOn(bridgeService, 'monitorBridgeTransaction').mockImplementation(() => Promise.resolve());

      const bridge = await bridgeService.executeBridge(
        mockUserContextHash,
        'ETH',
        'POLYGON',
        'USDC',
        'USDC',
        '1000',
        mockWalletAddress
      );

      expect(bridge.bridgeProvider).toBe('Polygon_Bridge');
      expect(bridge.transactionHash).toBe('0xabc123');
      expect(bridge.status).toBe('pending');
    });

    it('should execute Arbitrum bridge transaction', async () => {
      const mockEstimate: BridgeEstimate = {
        fromChain: 'ETH',
        toChain: 'ARBITRUM',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        amount: '1000',
        estimatedTime: 10,
        bridgeFee: '0',
        gasEstimate: '30',
        bestProvider: 'Arbitrum_Bridge',
        alternatives: []
      };

      jest.spyOn(bridgeService, 'estimateBridge').mockResolvedValue(mockEstimate);
      jest.spyOn(bridgeService as any, 'executeArbitrumBridge').mockResolvedValue('0xdef456');
      jest.spyOn(bridgeService as any, 'saveBridgeTransaction').mockResolvedValue(undefined);
      jest.spyOn(bridgeService, 'monitorBridgeTransaction').mockImplementation(() => Promise.resolve());

      const bridge = await bridgeService.executeBridge(
        mockUserContextHash,
        'ETH',
        'ARBITRUM',
        'USDC',
        'USDC',
        '1000',
        mockWalletAddress
      );

      expect(bridge.bridgeProvider).toBe('Arbitrum_Bridge');
      expect(bridge.transactionHash).toBe('0xdef456');
    });

    it('should handle unsupported bridge provider', async () => {
      const mockEstimate: BridgeEstimate = {
        fromChain: 'ETH',
        toChain: 'POLYGON',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        amount: '1000',
        estimatedTime: 5,
        bridgeFee: '0',
        gasEstimate: '20',
        bestProvider: 'Unknown_Bridge' as any,
        alternatives: []
      };

      jest.spyOn(bridgeService, 'estimateBridge').mockResolvedValue(mockEstimate);

      await expect(
        bridgeService.executeBridge(
          mockUserContextHash,
          'ETH',
          'POLYGON',
          'USDC',
          'USDC',
          '1000',
          mockWalletAddress
        )
      ).rejects.toThrow('Unsupported bridge provider: Unknown_Bridge');
    });
  });

  describe('monitorBridgeTransaction', () => {
    it('should update bridge status when transaction is confirmed', async () => {
      const mockBridge: MultiChainBridge = {
        bridgeId: 'bridge-123',
        fromChain: 'ETH',
        toChain: 'POLYGON',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        bridgeProvider: 'Polygon_Bridge',
        estimatedTime: 22,
        bridgeFee: '0',
        gasEstimate: '50',
        status: 'pending',
        transactionHash: '0xabc123'
      };

      const mockReceipt = {
        status: 1, // Success
        blockNumber: 12345
      };

      jest.spyOn(bridgeService as any, 'getBridgeTransaction').mockResolvedValue(mockBridge);
      (bridgeService as any).providers = {
        ETH: {
          getTransactionReceipt: jest.fn().mockResolvedValue(mockReceipt)
        }
      };
      jest.spyOn(bridgeService as any, 'updateBridgeStatus').mockResolvedValue(undefined);
      jest.spyOn(bridgeService as any, 'checkBridgeCompletion').mockResolvedValue(undefined);

      await bridgeService.monitorBridgeTransaction('bridge-123');

      expect(bridgeService['updateBridgeStatus']).toHaveBeenCalledWith('bridge-123', 'bridging');
    });

    it('should update status to failed when transaction fails', async () => {
      const mockBridge: MultiChainBridge = {
        bridgeId: 'bridge-123',
        fromChain: 'ETH',
        toChain: 'POLYGON',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        bridgeProvider: 'Polygon_Bridge',
        estimatedTime: 22,
        bridgeFee: '0',
        gasEstimate: '50',
        status: 'pending',
        transactionHash: '0xabc123'
      };

      const mockReceipt = {
        status: 0, // Failed
        blockNumber: 12345
      };

      jest.spyOn(bridgeService as any, 'getBridgeTransaction').mockResolvedValue(mockBridge);
      (bridgeService as any).providers = {
        ETH: {
          getTransactionReceipt: jest.fn().mockResolvedValue(mockReceipt)
        }
      };
      jest.spyOn(bridgeService as any, 'updateBridgeStatus').mockResolvedValue(undefined);

      await bridgeService.monitorBridgeTransaction('bridge-123');

      expect(bridgeService['updateBridgeStatus']).toHaveBeenCalledWith('bridge-123', 'failed');
    });

    it('should handle monitoring errors gracefully', async () => {
      jest.spyOn(bridgeService as any, 'getBridgeTransaction').mockRejectedValue(new Error('Database error'));
      
      // Should not throw
      await bridgeService.monitorBridgeTransaction('bridge-123');
    });
  });

  describe('getBridgeStatus', () => {
    it('should return bridge transaction status', async () => {
      const mockBridge: MultiChainBridge = {
        bridgeId: 'bridge-123',
        fromChain: 'ETH',
        toChain: 'POLYGON',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        bridgeProvider: 'Polygon_Bridge',
        estimatedTime: 22,
        bridgeFee: '0',
        gasEstimate: '50',
        status: 'completed',
        transactionHash: '0xabc123',
        bridgeTransactionHash: '0xdef456'
      };

      jest.spyOn(bridgeService as any, 'getBridgeTransaction').mockResolvedValue(mockBridge);

      const status = await bridgeService.getBridgeStatus('bridge-123');

      expect(status).toEqual(mockBridge);
    });

    it('should return null for non-existent bridge', async () => {
      jest.spyOn(bridgeService as any, 'getBridgeTransaction').mockResolvedValue(null);

      const status = await bridgeService.getBridgeStatus('non-existent');

      expect(status).toBeNull();
    });
  });

  describe('Bridge Option Selection', () => {
    it('should select best option based on reliability and cost', () => {
      const options = [
        {
          provider: 'Polygon_Bridge',
          estimatedTime: 22,
          bridgeFee: '0',
          gasEstimate: '50',
          totalCost: '50',
          reliability: 'high'
        },
        {
          provider: 'Multichain',
          estimatedTime: 5,
          bridgeFee: '5',
          gasEstimate: '15',
          totalCost: '20',
          reliability: 'medium'
        }
      ];

      const best = (bridgeService as any).selectBestBridgeOption(options);

      // Should prefer high reliability despite higher cost
      expect(best.provider).toBe('Polygon_Bridge');
    });

    it('should calculate bridge score correctly', () => {
      const option = {
        provider: 'Polygon_Bridge',
        estimatedTime: 22,
        bridgeFee: '0',
        gasEstimate: '50',
        totalCost: '50',
        reliability: 'high'
      };

      const score = (bridgeService as any).calculateBridgeScore(option);

      expect(score).toBeGreaterThan(0);
      expect(typeof score).toBe('number');
    });
  });
});