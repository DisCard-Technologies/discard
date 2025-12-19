import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import WalletBalanceDisplay from '../../../src/components/crypto/WalletBalanceDisplay';
import useCrypto, { useWalletOperations, usePortfolioOverview } from '../../../src/stores/crypto';

// Mock the crypto store and hooks
jest.mock('../../../src/stores/crypto');
const mockUseCrypto = useCrypto as jest.MockedFunction<typeof useCrypto>;
const mockUseWalletOperations = useWalletOperations as jest.MockedFunction<typeof useWalletOperations>;
const mockUsePortfolioOverview = usePortfolioOverview as jest.MockedFunction<typeof usePortfolioOverview>;

// Mock RefreshControl
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () => 'RefreshControl');

// Mock fetch for API calls
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('WalletBalanceDisplay', () => {
  const mockWalletId = 'test-wallet-id';
  const mockWallet = {
    walletId: mockWalletId,
    walletType: 'ethereum',
    walletName: 'Test Wallet',
    walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
    connectionStatus: 'connected',
    supportedCurrencies: ['ETH', 'USDT', 'USDC']
  };

  const mockBalance = {
    walletId: mockWalletId,
    balances: [
      {
        currency: 'ETH',
        amount: '2.5',
        usdValue: 7500,
        contractAddress: null
      },
      {
        currency: 'USDT',
        amount: '1000.00',
        usdValue: 1000,
        contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
      }
    ],
    totalUsdValue: 8500,
    lastUpdated: new Date().toISOString()
  };

  const mockCryptoStore = {
    walletBalances: { [mockWalletId]: mockBalance },
    conversionRates: {
      ETH: { usd: '3000' },
      USDT: { usd: '1' }
    },
    isRefreshing: false,
    error: null,
    refreshWalletBalance: jest.fn(),
    refreshAllBalances: jest.fn(),
    loadConversionRates: jest.fn()
  };

  const mockWalletOperations = {
    wallet: mockWallet,
    balance: mockBalance,
    error: null,
    refreshBalance: jest.fn(),
    disconnect: jest.fn(),
    clearError: jest.fn()
  };

  const mockPortfolioOverview = {
    totalValue: 8500,
    walletCount: 1,
    lastUpdate: new Date(),
    isRefreshing: false,
    refresh: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCrypto.mockReturnValue(mockCryptoStore as any);
    mockUseWalletOperations.mockReturnValue(mockWalletOperations as any);
    mockUsePortfolioOverview.mockReturnValue(mockPortfolioOverview as any);
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Component Rendering', () => {
    it('should render wallet balance information', () => {
      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByText('Test Wallet')).toBeTruthy();
      expect(screen.getByText('$8,500.00')).toBeTruthy();
      expect(screen.getByText('2.5 ETH')).toBeTruthy();
      expect(screen.getByText('1000.00 USDT')).toBeTruthy();
    });

    it('should show loading state when refreshing', () => {
      mockUseCrypto.mockReturnValue({
        ...mockCryptoStore,
        isRefreshing: true
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByTestId('loading-indicator')).toBeTruthy();
    });

    it('should display error message when error exists', () => {
      const errorMessage = 'Failed to load balance';
      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        error: errorMessage
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByText(errorMessage)).toBeTruthy();
    });

    it('should show placeholder when no balance data available', () => {
      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        balance: null
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByText('No balance data')).toBeTruthy();
    });

    it('should render portfolio overview mode', () => {
      render(<WalletBalanceDisplay wallet={mockWallet} showPortfolioOverview={true} />);
      
      expect(screen.getByText('Portfolio Overview')).toBeTruthy();
      expect(screen.getByText('$8,500.00')).toBeTruthy();
      expect(screen.getByText('1 wallet connected')).toBeTruthy();
    });
  });

  describe('Balance Display Formatting', () => {
    it('should format large numbers correctly', () => {
      const largeBalance = {
        ...mockBalance,
        balances: [
          {
            currency: 'ETH',
            amount: '1234.56789',
            usdValue: 3703703.67,
            contractAddress: null
          }
        ],
        totalUsdValue: 3703703.67
      };

      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        balance: largeBalance
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByText('$3,703,703.67')).toBeTruthy();
      expect(screen.getByText('1,234.57 ETH')).toBeTruthy(); // Should be rounded to 2 decimals
    });

    it('should handle small amounts correctly', () => {
      const smallBalance = {
        ...mockBalance,
        balances: [
          {
            currency: 'ETH',
            amount: '0.00012345',
            usdValue: 0.37,
            contractAddress: null
          }
        ],
        totalUsdValue: 0.37
      };

      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        balance: smallBalance
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByText('$0.37')).toBeTruthy();
      expect(screen.getByText('0.000123 ETH')).toBeTruthy(); // Should show more decimals for small amounts
    });

    it('should display zero balances appropriately', () => {
      const zeroBalance = {
        ...mockBalance,
        balances: [
          {
            currency: 'ETH',
            amount: '0.0',
            usdValue: 0,
            contractAddress: null
          }
        ],
        totalUsdValue: 0
      };

      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        balance: zeroBalance
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByText('$0.00')).toBeTruthy();
      expect(screen.getByText('0.00 ETH')).toBeTruthy();
    });
  });

  describe('Refresh Functionality', () => {
    it('should refresh balance when refresh button is pressed', async () => {
      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      const refreshButton = screen.getByTestId('refresh-button');
      fireEvent.press(refreshButton);
      
      expect(mockWalletOperations.refreshBalance).toHaveBeenCalled();
    });

    it('should support pull-to-refresh', async () => {
      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      const scrollView = screen.getByTestId('balance-scroll-view');
      fireEvent(scrollView, 'refresh');
      
      expect(mockWalletOperations.refreshBalance).toHaveBeenCalled();
    });

    it('should refresh portfolio overview when in portfolio mode', () => {
      render(<WalletBalanceDisplay wallet={mockWallet} showPortfolioOverview={true} />);
      
      const refreshButton = screen.getByTestId('refresh-button');
      fireEvent.press(refreshButton);
      
      expect(mockPortfolioOverview.refresh).toHaveBeenCalled();
    });

    it('should show loading state during manual refresh', async () => {
      mockWalletOperations.refreshBalance.mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 100));
      });

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      const refreshButton = screen.getByTestId('refresh-button');
      fireEvent.press(refreshButton);
      
      expect(screen.getByTestId('loading-indicator')).toBeTruthy();
      
      await waitFor(() => {
        expect(screen.queryByTestId('loading-indicator')).toBeFalsy();
      });
    });
  });

  describe('Auto-Refresh', () => {
    it('should auto-refresh when autoRefresh prop is enabled', () => {
      jest.useFakeTimers();
      
      render(<WalletBalanceDisplay wallet={mockWallet} autoRefresh={true} refreshInterval={30000} />);
      
      // Fast-forward time
      jest.advanceTimersByTime(30000);
      
      expect(mockWalletOperations.refreshBalance).toHaveBeenCalled();
      
      jest.useRealTimers();
    });

    it('should stop auto-refresh when component unmounts', () => {
      jest.useFakeTimers();
      
      const { unmount } = render(
        <WalletBalanceDisplay wallet={mockWallet} autoRefresh={true} refreshInterval={30000} />
      );
      
      unmount();
      
      // Clear any pending timers
      jest.advanceTimersByTime(30000);
      
      // Should not have been called after unmount
      expect(mockWalletOperations.refreshBalance).not.toHaveBeenCalled();
      
      jest.useRealTimers();
    });

    it('should respect custom refresh interval', () => {
      jest.useFakeTimers();
      
      render(<WalletBalanceDisplay wallet={mockWallet} autoRefresh={true} refreshInterval={10000} />);
      
      jest.advanceTimersByTime(9999); // Just before interval
      expect(mockWalletOperations.refreshBalance).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(1); // Exactly at interval
      expect(mockWalletOperations.refreshBalance).toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });

  describe('Currency Display Options', () => {
    it('should toggle between individual currencies and total view', () => {
      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      // Should show individual currencies by default
      expect(screen.getByText('2.5 ETH')).toBeTruthy();
      expect(screen.getByText('1000.00 USDT')).toBeTruthy();
      
      const toggleButton = screen.getByTestId('view-toggle-button');
      fireEvent.press(toggleButton);
      
      // Should now show only total
      expect(screen.queryByText('2.5 ETH')).toBeFalsy();
      expect(screen.getByText('$8,500.00')).toBeTruthy();
    });

    it('should filter currencies when filter is applied', () => {
      render(<WalletBalanceDisplay wallet={mockWallet} currencyFilter={['ETH']} />);
      
      expect(screen.getByText('2.5 ETH')).toBeTruthy();
      expect(screen.queryByText('1000.00 USDT')).toBeFalsy();
    });

    it('should sort currencies by value in descending order', () => {
      const unsortedBalance = {
        ...mockBalance,
        balances: [
          {
            currency: 'USDT',
            amount: '1000.00',
            usdValue: 1000,
            contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
          },
          {
            currency: 'ETH',
            amount: '2.5',
            usdValue: 7500,
            contractAddress: null
          }
        ]
      };

      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        balance: unsortedBalance
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      const currencyItems = screen.getAllByTestId(/currency-item-/);
      expect(currencyItems[0]).toHaveTextContent('ETH'); // Higher value should be first
      expect(currencyItems[1]).toHaveTextContent('USDT');
    });
  });

  describe('Last Updated Display', () => {
    it('should show last updated time', () => {
      render(<WalletBalanceDisplay wallet={mockWallet} showLastUpdated={true} />);
      
      expect(screen.getByText(/updated/i)).toBeTruthy();
    });

    it('should show relative time for recent updates', () => {
      const recentBalance = {
        ...mockBalance,
        lastUpdated: new Date(Date.now() - 60000).toISOString() // 1 minute ago
      };

      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        balance: recentBalance
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} showLastUpdated={true} />);
      
      expect(screen.getByText(/1 minute ago/i)).toBeTruthy();
    });

    it('should show exact time for older updates', () => {
      const oldBalance = {
        ...mockBalance,
        lastUpdated: new Date(Date.now() - 86400000).toISOString() // 1 day ago
      };

      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        balance: oldBalance
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} showLastUpdated={true} />);
      
      expect(screen.getByText(/yesterday/i)).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should display retry button when error occurs', () => {
      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        error: 'Network error'
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByText('Retry')).toBeTruthy();
    });

    it('should clear error and retry when retry button is pressed', () => {
      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        error: 'Network error'
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      const retryButton = screen.getByText('Retry');
      fireEvent.press(retryButton);
      
      expect(mockWalletOperations.clearError).toHaveBeenCalled();
      expect(mockWalletOperations.refreshBalance).toHaveBeenCalled();
    });

    it('should handle missing wallet gracefully', () => {
      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        wallet: null,
        balance: null
      } as any);

      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByText('Wallet not found')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels', () => {
      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByLabelText('Wallet balance: $8,500.00')).toBeTruthy();
      expect(screen.getByLabelText('Refresh balance')).toBeTruthy();
    });

    it('should support screen readers for balance information', () => {
      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByLabelText('Ethereum balance: 2.5 ETH, worth $7,500.00')).toBeTruthy();
      expect(screen.getByLabelText('Tether balance: 1000.00 USDT, worth $1,000.00')).toBeTruthy();
    });

    it('should announce balance updates to screen readers', async () => {
      const { rerender } = render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      const updatedBalance = {
        ...mockBalance,
        totalUsdValue: 9000
      };

      mockUseWalletOperations.mockReturnValue({
        ...mockWalletOperations,
        balance: updatedBalance
      } as any);

      rerender(<WalletBalanceDisplay wallet={mockWallet} />);
      
      expect(screen.getByLabelText('Balance updated to $9,000.00')).toBeTruthy();
    });
  });

  describe('Performance', () => {
    it('should memoize expensive calculations', () => {
      const { rerender } = render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      // Re-render with same props
      rerender(<WalletBalanceDisplay wallet={mockWallet} />);
      
      // Should not recalculate balance totals
      expect(screen.getByText('$8,500.00')).toBeTruthy();
    });

    it('should debounce rapid refresh requests', () => {
      jest.useFakeTimers();
      
      render(<WalletBalanceDisplay wallet={mockWallet} />);
      
      const refreshButton = screen.getByTestId('refresh-button');
      
      // Rapid clicks
      fireEvent.press(refreshButton);
      fireEvent.press(refreshButton);
      fireEvent.press(refreshButton);
      
      jest.advanceTimersByTime(500); // Advance past debounce
      
      // Should only call refresh once
      expect(mockWalletOperations.refreshBalance).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });
  });
});