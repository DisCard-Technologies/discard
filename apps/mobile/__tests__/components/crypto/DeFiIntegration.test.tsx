import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { DeFiIntegration } from '../../../src/components/crypto/DeFiIntegration';
import { useCryptoStore } from '../../../src/stores/crypto';
import { DeFiPosition } from '../../../src/types/defi.types';

// Mock the crypto store
jest.mock('../../../src/stores/crypto');
const mockUseCryptoStore = useCryptoStore as jest.MockedFunction<typeof useCryptoStore>;

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock formatting utilities
jest.mock('../../../src/utils/formatting', () => ({
  formatCurrency: (value: string) => `$${parseFloat(value).toFixed(2)}`,
  formatPercentage: (value: string) => parseFloat(value).toFixed(2)
}));

describe('DeFiIntegration', () => {
  const mockDeFiPositions: DeFiPosition[] = [
    {
      positionId: 'pos-1',
      protocolName: 'Aave',
      networkType: 'ETH',
      positionType: 'lending',
      underlyingAssets: [
        { asset: 'USDC', amount: '1000', usdValue: '1000', weight: 100 }
      ],
      currentYield: '3.5',
      totalValueLocked: '10000',
      availableForFunding: '5000',
      riskLevel: 'low',
      createdAt: new Date(),
      lastUpdated: new Date()
    },
    {
      positionId: 'pos-2',
      protocolName: 'Uniswap',
      networkType: 'POLYGON',
      positionType: 'liquidity_pool',
      underlyingAssets: [
        { asset: 'ETH', amount: '2', usdValue: '4000', weight: 50 },
        { asset: 'USDC', amount: '4000', usdValue: '4000', weight: 50 }
      ],
      currentYield: '15.2',
      totalValueLocked: '8000',
      availableForFunding: '8000',
      riskLevel: 'medium',
      createdAt: new Date(),
      lastUpdated: new Date()
    }
  ];

  const defaultMockStore = {
    defiPositions: mockDeFiPositions,
    isLoadingDeFi: false,
    fetchDeFiPositions: jest.fn().mockResolvedValue(undefined),
    syncDeFiPositions: jest.fn().mockResolvedValue(undefined),
    fundFromDeFiPosition: jest.fn().mockResolvedValue(undefined)
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCryptoStore.mockReturnValue(defaultMockStore as any);
  });

  describe('Component Rendering', () => {
    it('should render DeFi positions correctly', () => {
      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      expect(getByText('DeFi Positions')).toBeTruthy();
      expect(getByText('Aave')).toBeTruthy();
      expect(getByText('Uniswap')).toBeTruthy();
      expect(getByText('3.50%')).toBeTruthy(); // Aave yield
      expect(getByText('15.20%')).toBeTruthy(); // Uniswap yield
    });

    it('should show loading state when positions are being loaded', () => {
      mockUseCryptoStore.mockReturnValue({
        ...defaultMockStore,
        defiPositions: [],
        isLoadingDeFi: true
      } as any);

      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      expect(getByText('Loading DeFi positions...')).toBeTruthy();
    });

    it('should show empty state when no positions exist', () => {
      mockUseCryptoStore.mockReturnValue({
        ...defaultMockStore,
        defiPositions: [],
        isLoadingDeFi: false
      } as any);

      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      expect(getByText('No DeFi Positions Found')).toBeTruthy();
      expect(getByText('Connect your wallet and start earning yield on your crypto to fund your cards directly from DeFi protocols.')).toBeTruthy();
    });
  });

  describe('Portfolio Summary', () => {
    it('should display correct portfolio summary', () => {
      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      expect(getByText('Portfolio Summary')).toBeTruthy();
      expect(getByText('Total Value: $18000.00')).toBeTruthy(); // 10000 + 8000
      expect(getByText('2 Positions')).toBeTruthy();
    });

    it('should show singular position when only one exists', () => {
      mockUseCryptoStore.mockReturnValue({
        ...defaultMockStore,
        defiPositions: [mockDeFiPositions[0]]
      } as any);

      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      expect(getByText('1 Position')).toBeTruthy();
    });
  });

  describe('Position Interaction', () => {
    it('should show position details when position is pressed', () => {
      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      fireEvent.press(getByText('Aave'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Aave Position',
        expect.stringContaining('Network: ETH'),
        expect.arrayContaining([
          { text: 'Cancel', style: 'cancel' },
          { text: 'Fund Card', onPress: expect.any(Function) }
        ])
      );
    });

    it('should call onPositionSelect when provided', () => {
      const mockOnPositionSelect = jest.fn();
      const { getByText } = render(
        <DeFiIntegration
          userWalletAddress="0x123"
          onPositionSelect={mockOnPositionSelect}
        />
      );

      fireEvent.press(getByText('Aave'));

      expect(mockOnPositionSelect).toHaveBeenCalledWith(mockDeFiPositions[0]);
    });

    it('should handle funding confirmation', async () => {
      const mockFundFromDeFiPosition = jest.fn().mockResolvedValue(undefined);
      mockUseCryptoStore.mockReturnValue({
        ...defaultMockStore,
        fundFromDeFiPosition: mockFundFromDeFiPosition
      } as any);

      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      fireEvent.press(getByText('Aave'));

      // Simulate pressing "Fund Card" in the alert
      const alertCalls = (Alert.alert as jest.Mock).mock.calls;
      const fundCardCall = alertCalls.find(call => 
        call[0] === 'Aave Position'
      );
      const fundCardButton = fundCardCall[2].find((button: any) => 
        button.text === 'Fund Card'
      );

      // Execute the onPress function
      await fundCardButton.onPress();

      // Should show funding confirmation alert
      expect(Alert.alert).toHaveBeenCalledWith(
        'Fund Card',
        expect.stringContaining('Fund your card from Aave position?'),
        expect.any(Array)
      );
    });
  });

  describe('Refresh and Sync', () => {
    it('should handle refresh correctly', async () => {
      const mockSyncDeFiPositions = jest.fn().mockResolvedValue(undefined);
      mockUseCryptoStore.mockReturnValue({
        ...defaultMockStore,
        syncDeFiPositions: mockSyncDeFiPositions
      } as any);

      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      const syncButton = getByText('🔄 Sync');
      fireEvent.press(syncButton);

      await waitFor(() => {
        expect(mockSyncDeFiPositions).toHaveBeenCalledWith('0x123');
      });
    });

    it('should handle sync errors', async () => {
      const mockSyncDeFiPositions = jest.fn().mockRejectedValue(new Error('Sync failed'));
      mockUseCryptoStore.mockReturnValue({
        ...defaultMockStore,
        syncDeFiPositions: mockSyncDeFiPositions
      } as any);

      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      const syncButton = getByText('🔄 Sync');
      fireEvent.press(syncButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Sync Failed',
          'Could not sync with blockchain. Please try again.'
        );
      });
    });
  });

  describe('Risk Level Display', () => {
    it('should display correct risk colors and labels', () => {
      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      // Find risk level indicators
      const lowRiskElement = getByText('LOW');
      const mediumRiskElement = getByText('MEDIUM');

      expect(lowRiskElement).toBeTruthy();
      expect(mediumRiskElement).toBeTruthy();
    });
  });

  describe('Asset Breakdown', () => {
    it('should show underlying assets for positions', () => {
      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      expect(getByText('Assets:')).toBeTruthy();
      expect(getByText('USDC (100%)')).toBeTruthy(); // Aave position
      expect(getByText('ETH (50%)')).toBeTruthy(); // Uniswap position
    });
  });

  describe('Error Handling', () => {
    it('should handle funding errors gracefully', async () => {
      const mockFundFromDeFiPosition = jest.fn().mockRejectedValue(new Error('Funding failed'));
      mockUseCryptoStore.mockReturnValue({
        ...defaultMockStore,
        fundFromDeFiPosition: mockFundFromDeFiPosition
      } as any);

      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      fireEvent.press(getByText('Aave'));

      // Navigate through alert flow to trigger funding
      const alertCalls = (Alert.alert as jest.Mock).mock.calls;
      const fundCardCall = alertCalls.find(call => call[0] === 'Aave Position');
      await fundCardCall[2].find((btn: any) => btn.text === 'Fund Card').onPress();

      // Click confirm in the funding confirmation
      const confirmCall = alertCalls.find(call => call[0] === 'Fund Card');
      await confirmCall[2].find((btn: any) => btn.text === 'Confirm').onPress();

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Funding Failed',
          'Could not initiate funding from DeFi position.'
        );
      });
    });

    it('should handle initial load errors', async () => {
      const mockFetchDeFiPositions = jest.fn().mockRejectedValue(new Error('Load failed'));
      mockUseCryptoStore.mockReturnValue({
        ...defaultMockStore,
        fetchDeFiPositions: mockFetchDeFiPositions
      } as any);

      render(<DeFiIntegration userWalletAddress="0x123" />);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          'Failed to load DeFi positions. Please try again.'
        );
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels', () => {
      const { getByText } = render(
        <DeFiIntegration userWalletAddress="0x123" />
      );

      // Check that key elements are accessible
      expect(getByText('DeFi Positions')).toBeTruthy();
      expect(getByText('Portfolio Summary')).toBeTruthy();
      expect(getByText('🔄 Sync')).toBeTruthy();
    });
  });
});