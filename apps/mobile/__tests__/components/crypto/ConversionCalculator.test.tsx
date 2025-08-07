import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ConversionCalculator } from '../../../src/components/crypto/ConversionCalculator';
import useCrypto, { useConversionOperations } from '../../../src/stores/crypto';
import { Alert } from 'react-native';

// Mock the crypto store
jest.mock('../../../src/stores/crypto');

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('ConversionCalculator', () => {
  const mockCalculateConversion = jest.fn();
  const mockCreateQuote = jest.fn();
  const mockClearError = jest.fn();
  const mockOnQuoteCreated = jest.fn();

  const mockConversionOperations = {
    activeQuote: null,
    rateComparison: null,
    isCalculating: false,
    isComparing: false,
    error: null,
    calculateConversion: mockCalculateConversion,
    compareRates: jest.fn(),
    createQuote: mockCreateQuote,
    cancelQuote: jest.fn(),
    clearQuote: jest.fn(),
    clearError: mockClearError,
  };

  const mockCryptoStore = {
    conversionRates: {
      BTC: { usd: '45000.00', lastUpdated: new Date().toISOString() },
      ETH: { usd: '3000.00', lastUpdated: new Date().toISOString() },
      USDT: { usd: '1.00', lastUpdated: new Date().toISOString() },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useConversionOperations as jest.Mock).mockReturnValue(mockConversionOperations);
    (useCrypto as jest.Mock).mockReturnValue(mockCryptoStore);
  });

  it('should render correctly with initial state', () => {
    const { getByText, getByPlaceholderText } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    expect(getByText('Convert Crypto to USD')).toBeTruthy();
    expect(getByPlaceholderText('Enter USD amount')).toBeTruthy();
    expect(getByText('Select Cryptocurrency')).toBeTruthy();
  });

  it('should calculate conversion when amount and crypto are selected', async () => {
    const mockConversionResponse = {
      fromCrypto: 'BTC',
      toUsd: 10000,
      cryptoAmount: '0.00222',
      exchangeRate: '45000.00',
      slippageLimit: 2,
      fees: {
        networkFee: 150,
        conversionFee: 50,
        platformFee: 20,
        totalFee: 220,
      },
      quote: {
        quoteId: 'test-quote-id',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    };

    mockCalculateConversion.mockResolvedValue(mockConversionResponse);

    const { getByPlaceholderText, getByText, getByTestId } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    // Enter USD amount
    const amountInput = getByPlaceholderText('Enter USD amount');
    fireEvent.changeText(amountInput, '100');

    // Select cryptocurrency
    const cryptoSelector = getByTestId('crypto-selector');
    fireEvent.press(cryptoSelector);
    fireEvent.press(getByText('BTC - Bitcoin'));

    // Wait for calculation
    await waitFor(() => {
      expect(mockCalculateConversion).toHaveBeenCalledWith({
        fromCrypto: 'BTC',
        toUsd: 10000,
        slippageLimit: 2,
      });
    });

    // Check if results are displayed
    await waitFor(() => {
      expect(getByText('0.00222 BTC')).toBeTruthy();
      expect(getByText('$45,000.00')).toBeTruthy();
      expect(getByText('$2.20')).toBeTruthy(); // Total fee
    });
  });

  it('should handle custom slippage limit', async () => {
    const { getByPlaceholderText, getByText, getByTestId } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    // Toggle advanced settings
    fireEvent.press(getByText('Advanced Settings'));

    // Set custom slippage
    const slippageInput = getByTestId('slippage-input');
    fireEvent.changeText(slippageInput, '1');

    // Enter amount and select crypto
    fireEvent.changeText(getByPlaceholderText('Enter USD amount'), '100');
    fireEvent.press(getByTestId('crypto-selector'));
    fireEvent.press(getByText('ETH - Ethereum'));

    await waitFor(() => {
      expect(mockCalculateConversion).toHaveBeenCalledWith({
        fromCrypto: 'ETH',
        toUsd: 10000,
        slippageLimit: 1,
      });
    });
  });

  it('should display fee breakdown', async () => {
    const mockConversionResponse = {
      fromCrypto: 'BTC',
      toUsd: 10000,
      cryptoAmount: '0.00222',
      exchangeRate: '45000.00',
      slippageLimit: 2,
      fees: {
        networkFee: 150,
        conversionFee: 50,
        platformFee: 20,
        totalFee: 220,
      },
    };

    mockCalculateConversion.mockResolvedValue(mockConversionResponse);

    const { getByPlaceholderText, getByText, getByTestId } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    // Calculate conversion
    fireEvent.changeText(getByPlaceholderText('Enter USD amount'), '100');
    fireEvent.press(getByTestId('crypto-selector'));
    fireEvent.press(getByText('BTC - Bitcoin'));

    await waitFor(() => {
      expect(getByText('Fee Breakdown')).toBeTruthy();
    });

    // Expand fee breakdown
    fireEvent.press(getByText('Fee Breakdown'));

    expect(getByText('Network Fee:')).toBeTruthy();
    expect(getByText('$1.50')).toBeTruthy();
    expect(getByText('Conversion Fee:')).toBeTruthy();
    expect(getByText('$0.50')).toBeTruthy();
    expect(getByText('Platform Fee:')).toBeTruthy();
    expect(getByText('$0.20')).toBeTruthy();
  });

  it('should create quote when confirm button is pressed', async () => {
    const mockQuote = {
      quoteId: 'test-quote-id',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };

    mockCalculateConversion.mockResolvedValue({
      fromCrypto: 'BTC',
      toUsd: 10000,
      cryptoAmount: '0.00222',
      quote: mockQuote,
    });

    mockCreateQuote.mockResolvedValue(mockQuote);

    const { getByPlaceholderText, getByText, getByTestId } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    // Calculate conversion
    fireEvent.changeText(getByPlaceholderText('Enter USD amount'), '100');
    fireEvent.press(getByTestId('crypto-selector'));
    fireEvent.press(getByText('BTC - Bitcoin'));

    await waitFor(() => {
      expect(getByText('Create Quote')).toBeTruthy();
    });

    // Create quote
    fireEvent.press(getByText('Create Quote'));

    await waitFor(() => {
      expect(mockCreateQuote).toHaveBeenCalledWith('BTC', 10000, 2);
      expect(mockOnQuoteCreated).toHaveBeenCalledWith(mockQuote);
    });
  });

  it('should show quote expiration timer', async () => {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const mockQuote = {
      quoteId: 'test-quote-id',
      expiresAt,
    };

    (useConversionOperations as jest.Mock).mockReturnValue({
      ...mockConversionOperations,
      activeQuote: mockQuote,
    });

    const { getByText } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    // Should show expiration timer
    expect(getByText(/Quote expires in/)).toBeTruthy();
    expect(getByText(/4:5[0-9]/)).toBeTruthy(); // Should be close to 5 minutes
  });

  it('should handle errors gracefully', async () => {
    mockCalculateConversion.mockRejectedValue(new Error('Calculation failed'));

    const { getByPlaceholderText, getByText, getByTestId } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    // Try to calculate
    fireEvent.changeText(getByPlaceholderText('Enter USD amount'), '100');
    fireEvent.press(getByTestId('crypto-selector'));
    fireEvent.press(getByText('BTC - Bitcoin'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Conversion Error',
        expect.any(String),
        expect.any(Array)
      );
    });
  });

  it('should validate USD amount limits', () => {
    const { getByPlaceholderText, getByText } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    const amountInput = getByPlaceholderText('Enter USD amount');

    // Test below minimum
    fireEvent.changeText(amountInput, '0.50');
    fireEvent.blur(amountInput);
    expect(getByText('Minimum amount is $1.00')).toBeTruthy();

    // Test above maximum
    fireEvent.changeText(amountInput, '15000');
    fireEvent.blur(amountInput);
    expect(getByText('Maximum amount is $10,000.00')).toBeTruthy();

    // Test valid amount
    fireEvent.changeText(amountInput, '100');
    fireEvent.blur(amountInput);
    expect(() => getByText('Minimum amount is $1.00')).toThrow();
  });

  it('should format currency values correctly', () => {
    const { getByPlaceholderText, getByTestId } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    const amountInput = getByPlaceholderText('Enter USD amount');
    
    // Test formatting
    fireEvent.changeText(amountInput, '1234.56');
    fireEvent.blur(amountInput);
    
    expect(getByTestId('formatted-amount').props.children).toContain('$1,234.56');
  });

  it('should disable inputs while calculating', async () => {
    (useConversionOperations as jest.Mock).mockReturnValue({
      ...mockConversionOperations,
      isCalculating: true,
    });

    const { getByPlaceholderText, getByTestId } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    const amountInput = getByPlaceholderText('Enter USD amount');
    const cryptoSelector = getByTestId('crypto-selector');

    expect(amountInput.props.editable).toBe(false);
    expect(cryptoSelector.props.disabled).toBe(true);
  });

  it('should show loading indicator while calculating', () => {
    (useConversionOperations as jest.Mock).mockReturnValue({
      ...mockConversionOperations,
      isCalculating: true,
    });

    const { getByTestId } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('should clear error when component unmounts', () => {
    const { unmount } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    unmount();

    expect(mockClearError).toHaveBeenCalled();
  });

  it('should recalculate when slippage changes', async () => {
    const { getByPlaceholderText, getByText, getByTestId } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    // Initial calculation
    fireEvent.changeText(getByPlaceholderText('Enter USD amount'), '100');
    fireEvent.press(getByTestId('crypto-selector'));
    fireEvent.press(getByText('BTC - Bitcoin'));

    await waitFor(() => {
      expect(mockCalculateConversion).toHaveBeenCalledTimes(1);
    });

    // Change slippage
    fireEvent.press(getByText('Advanced Settings'));
    fireEvent.changeText(getByTestId('slippage-input'), '3');

    await waitFor(() => {
      expect(mockCalculateConversion).toHaveBeenCalledTimes(2);
      expect(mockCalculateConversion).toHaveBeenLastCalledWith({
        fromCrypto: 'BTC',
        toUsd: 10000,
        slippageLimit: 3,
      });
    });
  });

  it('should show real-time rate updates', () => {
    const { getByText } = render(
      <ConversionCalculator onQuoteCreated={mockOnQuoteCreated} />
    );

    expect(getByText('BTC: $45,000.00')).toBeTruthy();
    expect(getByText('ETH: $3,000.00')).toBeTruthy();
    expect(getByText('USDT: $1.00')).toBeTruthy();
  });
});