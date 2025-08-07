import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { TransactionProcessor } from '../../../src/components/crypto/TransactionProcessor';
import { useCryptoStore } from '../../../src/stores/crypto';

// Mock the crypto store
jest.mock('../../../src/stores/crypto', () => ({
  useCryptoStore: jest.fn()
}));

// Mock the NetworkCongestionIndicator component
jest.mock('../../../src/components/crypto/NetworkCongestionIndicator', () => ({
  NetworkCongestionIndicator: ({ networkType }: { networkType: string }) => (
    <div testID={`network-congestion-${networkType}`}>Network Status</div>
  )
}));

// Mock the FeeEstimator component
jest.mock('../../../src/components/crypto/FeeEstimator', () => ({
  FeeEstimator: ({ networkType, onFeeEstimated }: { 
    networkType: string; 
    onFeeEstimated: (fee: number) => void; 
  }) => {
    React.useEffect(() => {
      onFeeEstimated(2500); // Mock fee estimate
    }, [onFeeEstimated]);
    
    return <div testID={`fee-estimator-${networkType}`}>Fee Estimator</div>;
  }
}));

describe('TransactionProcessor', () => {
  const mockProcessTransaction = jest.fn();
  const mockGetNetworkCongestion = jest.fn();
  
  const defaultProps = {
    cardId: 'test-card-123',
    networkType: 'BTC' as const,
    amount: '1.0',
    fromAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    toAddress: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'
  };

  const mockCryptoStore = {
    processTransaction: mockProcessTransaction,
    getNetworkCongestion: mockGetNetworkCongestion,
    networkCongestion: {
      BTC: {
        level: 'medium',
        feeEstimates: {
          slow: 1500,
          standard: 3000,
          fast: 5000
        },
        lastUpdated: new Date().toISOString()
      }
    },
    isLoading: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useCryptoStore as jest.Mock).mockReturnValue(mockCryptoStore);
  });

  describe('Rendering', () => {
    it('should render transaction details correctly', () => {
      render(<TransactionProcessor {...defaultProps} />);

      expect(screen.getByText('Process BTC Transaction')).toBeTruthy();
      expect(screen.getByText('1.00000000 BTC')).toBeTruthy();
      expect(screen.getByText('3 (~30 minutes)')).toBeTruthy();
      expect(screen.getByText('Process Transaction')).toBeTruthy();
    });

    it('should render network congestion indicator', () => {
      render(<TransactionProcessor {...defaultProps} />);

      expect(screen.getByTestId('network-congestion-BTC')).toBeTruthy();
    });

    it('should render fee estimator', () => {
      render(<TransactionProcessor {...defaultProps} />);

      expect(screen.getByTestId('fee-estimator-BTC')).toBeTruthy();
    });

    it('should show estimated network fee after fee estimation', async () => {
      render(<TransactionProcessor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('$25.00')).toBeTruthy(); // 2500 cents = $25.00
      });
    });

    it('should show congestion warning for high congestion', () => {
      const highCongestionStore = {
        ...mockCryptoStore,
        networkCongestion: {
          BTC: {
            level: 'high',
            feeEstimates: { slow: 3000, standard: 6000, fast: 10000 }
          }
        }
      };

      (useCryptoStore as jest.Mock).mockReturnValue(highCongestionStore);
      
      render(<TransactionProcessor {...defaultProps} />);

      expect(screen.getByText(/Network congestion: HIGH/)).toBeTruthy();
      expect(screen.getByText(/Transactions may take longer than usual/)).toBeTruthy();
    });
  });

  describe('Network Types', () => {
    it('should show correct confirmation requirements for different networks', () => {
      const networks = [
        { type: 'BTC', confirmations: 3, time: '~30 minutes' },
        { type: 'ETH', confirmations: 12, time: '~3 minutes' },
        { type: 'USDT', confirmations: 12, time: '~3 minutes' },
        { type: 'USDC', confirmations: 12, time: '~3 minutes' },
        { type: 'XRP', confirmations: 1, time: '~4 seconds' }
      ];

      networks.forEach(network => {
        const props = { ...defaultProps, networkType: network.type as any };
        const { unmount } = render(<TransactionProcessor {...props} />);

        expect(screen.getByText(`${network.confirmations} (${network.time})`)).toBeTruthy();
        unmount();
      });
    });
  });

  describe('Transaction Processing', () => {
    it('should call processTransaction with correct parameters on button press', async () => {
      mockProcessTransaction.mockResolvedValue({
        processingId: 'proc-123',
        status: 'initiated',
        estimatedCompletion: '2023-01-01T12:00:00Z',
        networkFeeEstimate: 2500,
        requiredConfirmations: 3
      });

      const onTransactionInitiated = jest.fn();
      
      render(
        <TransactionProcessor 
          {...defaultProps} 
          onTransactionInitiated={onTransactionInitiated}
        />
      );

      const processButton = screen.getByText('Process Transaction');
      fireEvent.press(processButton);

      await waitFor(() => {
        expect(mockProcessTransaction).toHaveBeenCalledWith({
          cardId: 'test-card-123',
          networkType: 'BTC',
          amount: '1.0',
          fromAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          toAddress: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
          blockchainTxHash: expect.any(String)
        });
        
        expect(onTransactionInitiated).toHaveBeenCalledWith('proc-123');
      });
    });

    it('should show processing state during transaction processing', async () => {
      mockProcessTransaction.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      render(<TransactionProcessor {...defaultProps} />);

      const processButton = screen.getByText('Process Transaction');
      fireEvent.press(processButton);

      expect(screen.getByText('Processing...')).toBeTruthy();
      expect(processButton.props.disabled).toBe(true);
    });

    it('should show estimated completion time after successful processing', async () => {
      const estimatedCompletion = new Date(Date.now() + 30 * 60000); // 30 minutes from now
      
      mockProcessTransaction.mockResolvedValue({
        processingId: 'proc-123',
        status: 'initiated',
        estimatedCompletion: estimatedCompletion.toISOString(),
        networkFeeEstimate: 2500,
        requiredConfirmations: 3
      });

      render(<TransactionProcessor {...defaultProps} />);

      const processButton = screen.getByText('Process Transaction');
      fireEvent.press(processButton);

      await waitFor(() => {
        const timeString = estimatedCompletion.toLocaleTimeString();
        expect(screen.getByText(timeString)).toBeTruthy();
      });
    });

    it('should handle transaction processing errors', async () => {
      const errorMessage = 'Transaction blocked by fraud detection';
      mockProcessTransaction.mockRejectedValue(new Error(errorMessage));

      const onError = jest.fn();
      
      render(
        <TransactionProcessor 
          {...defaultProps} 
          onError={onError}
        />
      );

      const processButton = screen.getByText('Process Transaction');
      fireEvent.press(processButton);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(errorMessage);
      });
    });

    it('should require blockchain transaction hash', async () => {
      // Mock Alert.alert to capture alert calls
      const alertSpy = jest.spyOn(require('react-native'), 'Alert').mockImplementation(
        jest.fn()
      );

      render(<TransactionProcessor {...defaultProps} />);

      const processButton = screen.getByText('Process Transaction');
      fireEvent.press(processButton);

      expect(alertSpy).toHaveBeenCalledWith('Error', 'Blockchain transaction hash is required');
      expect(mockProcessTransaction).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });
  });

  describe('Network Congestion Integration', () => {
    it('should load network congestion data on mount', () => {
      render(<TransactionProcessor {...defaultProps} />);

      expect(mockGetNetworkCongestion).toHaveBeenCalledWith('BTC');
    });

    it('should reload network data when network type changes', () => {
      const { rerender } = render(<TransactionProcessor {...defaultProps} />);

      expect(mockGetNetworkCongestion).toHaveBeenCalledWith('BTC');

      rerender(<TransactionProcessor {...defaultProps} networkType="ETH" />);

      expect(mockGetNetworkCongestion).toHaveBeenCalledWith('ETH');
    });
  });

  describe('Security Note', () => {
    it('should display security information', () => {
      render(<TransactionProcessor {...defaultProps} />);

      expect(screen.getByText(/advanced fraud detection system/)).toBeTruthy();
      expect(screen.getByText(/protecting your privacy/)).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels', () => {
      render(<TransactionProcessor {...defaultProps} />);

      const processButton = screen.getByText('Process Transaction');
      expect(processButton).toBeTruthy();
      
      // Test that addresses are properly truncated for screen readers
      const fromAddress = screen.getByText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      expect(fromAddress.props.numberOfLines).toBe(1);
      expect(fromAddress.props.ellipsizeMode).toBe('middle');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing network congestion data', () => {
      const storeWithoutCongestion = {
        ...mockCryptoStore,
        networkCongestion: {}
      };

      (useCryptoStore as jest.Mock).mockReturnValue(storeWithoutCongestion);
      
      render(<TransactionProcessor {...defaultProps} />);

      // Should still render without crashing
      expect(screen.getByText('Process BTC Transaction')).toBeTruthy();
    });

    it('should handle loading state', () => {
      const loadingStore = {
        ...mockCryptoStore,
        isLoading: true
      };

      (useCryptoStore as jest.Mock).mockReturnValue(loadingStore);
      
      render(<TransactionProcessor {...defaultProps} />);

      const processButton = screen.getByText('Process Transaction');
      expect(processButton.props.disabled).toBe(true);
    });

    it('should format currencies correctly for different amounts', () => {
      const amounts = [
        { amount: '0.00000001', expected: '0.00000001 BTC' },
        { amount: '1', expected: '1.00000000 BTC' },
        { amount: '1.23456789', expected: '1.23456789 BTC' }
      ];

      amounts.forEach(({ amount, expected }) => {
        const { unmount } = render(
          <TransactionProcessor {...defaultProps} amount={amount} />
        );
        
        expect(screen.getByText(expected)).toBeTruthy();
        unmount();
      });
    });
  });
});