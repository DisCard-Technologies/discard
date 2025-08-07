import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RateComparisonView } from '../../../src/components/crypto/RateComparisonView';
import { useConversionOperations } from '../../../src/stores/crypto';

// Mock the crypto store
jest.mock('../../../src/stores/crypto');

describe('RateComparisonView', () => {
  const mockCompareRates = jest.fn();
  const mockClearError = jest.fn();
  const mockOnOptimalSelected = jest.fn();

  const mockComparisonData = {
    targetUsdAmount: 50000,
    comparisons: [
      {
        symbol: 'BTC',
        cryptoAmount: '0.00111',
        exchangeRate: '45000.00',
        networkFee: 150,
        conversionFee: 250,
        platformFee: 100,
        totalFee: 500,
        totalCost: 50500,
        efficiency: 99.01,
        savingsVsWorst: 200,
        isOptimal: true,
      },
      {
        symbol: 'ETH',
        cryptoAmount: '0.01667',
        exchangeRate: '3000.00',
        networkFee: 200,
        conversionFee: 250,
        platformFee: 100,
        totalFee: 550,
        totalCost: 50550,
        efficiency: 98.91,
        savingsVsWorst: 150,
        isOptimal: false,
      },
      {
        symbol: 'USDT',
        cryptoAmount: '507.00',
        exchangeRate: '1.00',
        networkFee: 400,
        conversionFee: 50,
        platformFee: 50,
        totalFee: 500,
        totalCost: 50500,
        efficiency: 99.01,
        savingsVsWorst: 200,
        isOptimal: false,
      },
    ],
    optimalCurrency: 'BTC',
    worstCurrency: 'ETH',
    maxSavings: 200,
  };

  const mockConversionOperations = {
    activeQuote: null,
    rateComparison: mockComparisonData,
    isCalculating: false,
    isComparing: false,
    error: null,
    calculateConversion: jest.fn(),
    compareRates: mockCompareRates,
    createQuote: jest.fn(),
    cancelQuote: jest.fn(),
    clearQuote: jest.fn(),
    clearError: mockClearError,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useConversionOperations as jest.Mock).mockReturnValue(mockConversionOperations);
  });

  it('should render correctly with comparison data', () => {
    const { getByText } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    expect(getByText('Rate Comparison')).toBeTruthy();
    expect(getByText('Comparing rates for $500.00 funding')).toBeTruthy();
    expect(getByText('BTC')).toBeTruthy();
    expect(getByText('ETH')).toBeTruthy();
    expect(getByText('USDT')).toBeTruthy();
  });

  it('should trigger rate comparison on mount', async () => {
    render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    await waitFor(() => {
      expect(mockCompareRates).toHaveBeenCalledWith({
        targetUsdAmount: 50000,
        cryptoSymbols: undefined,
      });
    });
  });

  it('should show optimal currency indicator', () => {
    const { getByTestId } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    const btcCard = getByTestId('comparison-card-BTC');
    expect(btcCard).toBeTruthy();
    
    // Should have optimal indicator
    const optimalBadge = getByTestId('optimal-badge-BTC');
    expect(optimalBadge).toBeTruthy();
  });

  it('should display correct amounts and fees', () => {
    const { getByText } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    // Check BTC amounts
    expect(getByText('0.00111 BTC')).toBeTruthy();
    expect(getByText('$505.00')).toBeTruthy(); // Total cost
    expect(getByText('$5.00')).toBeTruthy(); // Total fee

    // Check efficiency
    expect(getByText('99.01%')).toBeTruthy();
  });

  it('should show savings information', () => {
    const { getByText } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    expect(getByText('Save $2.00 vs worst option')).toBeTruthy();
  });

  it('should allow selection of optimal currency', async () => {
    const { getByText, getByTestId } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    const btcCard = getByTestId('comparison-card-BTC');
    fireEvent.press(btcCard);

    // Should show select button for optimal currency
    const selectButton = getByText('Select BTC');
    expect(selectButton).toBeTruthy();

    fireEvent.press(selectButton);

    expect(mockOnOptimalSelected).toHaveBeenCalledWith({
      symbol: 'BTC',
      cryptoAmount: '0.00111',
      exchangeRate: '45000.00',
      totalCost: 50500,
      totalFee: 500,
    });
  });

  it('should filter by specific cryptocurrencies', async () => {
    render(
      <RateComparisonView 
        targetUsdAmount={50000}
        cryptoSymbols={['BTC', 'ETH']}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    await waitFor(() => {
      expect(mockCompareRates).toHaveBeenCalledWith({
        targetUsdAmount: 50000,
        cryptoSymbols: ['BTC', 'ETH'],
      });
    });
  });

  it('should show loading state while comparing', () => {
    (useConversionOperations as jest.Mock).mockReturnValue({
      ...mockConversionOperations,
      isComparing: true,
      rateComparison: null,
    });

    const { getByTestId } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    expect(getByTestId('loading-indicator')).toBeTruthy();
    expect(getByTestId('loading-text')).toBeTruthy();
  });

  it('should handle error state', () => {
    (useConversionOperations as jest.Mock).mockReturnValue({
      ...mockConversionOperations,
      error: 'Failed to compare rates',
      rateComparison: null,
    });

    const { getByText } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    expect(getByText('Error loading comparison')).toBeTruthy();
    expect(getByText('Failed to compare rates')).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
  });

  it('should retry comparison on error', async () => {
    (useConversionOperations as jest.Mock).mockReturnValue({
      ...mockConversionOperations,
      error: 'Failed to compare rates',
      rateComparison: null,
    });

    const { getByText } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    fireEvent.press(getByText('Retry'));

    await waitFor(() => {
      expect(mockClearError).toHaveBeenCalled();
      expect(mockCompareRates).toHaveBeenCalledTimes(2);
    });
  });

  it('should update comparison when target amount changes', async () => {
    const { rerender } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    await waitFor(() => {
      expect(mockCompareRates).toHaveBeenCalledTimes(1);
    });

    // Change target amount
    rerender(
      <RateComparisonView 
        targetUsdAmount={100000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    await waitFor(() => {
      expect(mockCompareRates).toHaveBeenCalledWith({
        targetUsdAmount: 100000,
        cryptoSymbols: undefined,
      });
      expect(mockCompareRates).toHaveBeenCalledTimes(2);
    });
  });

  it('should expand fee breakdown when tapped', () => {
    const { getByText, getByTestId } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    const feeBreakdown = getByTestId('fee-breakdown-BTC');
    fireEvent.press(feeBreakdown);

    // Should show detailed fee breakdown
    expect(getByText('Network Fee: $1.50')).toBeTruthy();
    expect(getByText('Conversion Fee: $2.50')).toBeTruthy();
    expect(getByText('Platform Fee: $1.00')).toBeTruthy();
  });

  it('should sort comparisons by efficiency', () => {
    const { getAllByTestId } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    const comparisonCards = getAllByTestId(/comparison-card-/);
    
    // Should be sorted with BTC first (99.01%), then USDT (99.01%), then ETH (98.91%)
    expect(comparisonCards[0].props.testID).toBe('comparison-card-BTC');
    expect(comparisonCards[1].props.testID).toBe('comparison-card-USDT');
    expect(comparisonCards[2].props.testID).toBe('comparison-card-ETH');
  });

  it('should refresh comparison data', async () => {
    const { getByTestId } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
        showRefreshButton={true}
      />
    );

    const refreshButton = getByTestId('refresh-button');
    fireEvent.press(refreshButton);

    await waitFor(() => {
      expect(mockCompareRates).toHaveBeenCalledTimes(2);
    });
  });

  it('should show comparison summary', () => {
    const { getByText } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    expect(getByText('Best Option: BTC')).toBeTruthy();
    expect(getByText('Max Savings: $2.00')).toBeTruthy();
    expect(getByText('3 options compared')).toBeTruthy();
  });

  it('should handle empty comparison results', () => {
    (useConversionOperations as jest.Mock).mockReturnValue({
      ...mockConversionOperations,
      rateComparison: {
        ...mockComparisonData,
        comparisons: [],
      },
    });

    const { getByText } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    expect(getByText('No comparison data available')).toBeTruthy();
  });

  it('should clean up on unmount', () => {
    const { unmount } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    unmount();

    expect(mockClearError).toHaveBeenCalled();
  });

  it('should show cost efficiency indicators', () => {
    const { getByTestId } = render(
      <RateComparisonView 
        targetUsdAmount={50000}
        onOptimalSelected={mockOnOptimalSelected}
      />
    );

    // Should show efficiency bars or indicators
    expect(getByTestId('efficiency-indicator-BTC')).toBeTruthy();
    expect(getByTestId('efficiency-indicator-ETH')).toBeTruthy();
    expect(getByTestId('efficiency-indicator-USDT')).toBeTruthy();
  });
});