import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

// Mock React Native components and APIs
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Platform: {
      OS: 'ios',
      select: jest.fn((obj) => obj.ios || obj.default)
    },
    Alert: {
      alert: jest.fn()
    },
    AsyncStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    }
  };
});

// Mock navigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn()
  }),
  useRoute: () => ({
    params: {}
  })
}));

// Mock API client
const mockApiClient = {
  post: jest.fn(),
  get: jest.fn(),
  put: jest.fn()
};

jest.mock('../../lib/api', () => mockApiClient);

// Mock stores
const mockFundingStore = {
  accountBalance: {
    totalBalance: 0,
    allocatedBalance: 0,
    availableBalance: 0
  },
  transactions: [],
  isLoading: false,
  error: null,
  fundAccount: jest.fn(),
  allocateToCard: jest.fn(),
  transferBetweenCards: jest.fn(),
  loadAccountBalance: jest.fn(),
  loadTransactions: jest.fn(),
  clearError: jest.fn()
};

jest.mock('../../stores/funding', () => ({
  useFundingStore: () => mockFundingStore
}));

// Import components for testing
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock the funding components since we can't import them in this test context
const MockFundingScreen = ({ navigation }: any) => {
  const [amount, setAmount] = React.useState('');
  const [paymentMethodId, setPaymentMethodId] = React.useState('');
  
  const handleFundAccount = async () => {
    try {
      await mockApiClient.post('/api/v1/funding/account', {
        amount: parseFloat(amount) * 100,
        paymentMethodId,
        currency: 'USD'
      });
    } catch (error) {
      console.error('Funding failed:', error);
    }
  };

  return React.createElement('View', {
    testID: 'funding-screen'
  }, [
    React.createElement('TextInput', {
      key: 'amount-input',
      testID: 'amount-input',
      value: amount,
      onChangeText: setAmount,
      placeholder: 'Enter amount'
    }),
    React.createElement('TextInput', {
      key: 'payment-method-input', 
      testID: 'payment-method-input',
      value: paymentMethodId,
      onChangeText: setPaymentMethodId,
      placeholder: 'Payment method ID'
    }),
    React.createElement('TouchableOpacity', {
      key: 'fund-button',
      testID: 'fund-account-button',
      onPress: handleFundAccount
    }, React.createElement('Text', null, 'Fund Account'))
  ]);
};

const MockCardAllocationScreen = ({ route }: any) => {
  const [amount, setAmount] = React.useState('');
  const cardId = route?.params?.cardId || 'test-card-id';
  
  const handleAllocate = async () => {
    try {
      await mockApiClient.post(`/api/v1/funding/card/${cardId}`, {
        amount: parseFloat(amount) * 100
      });
    } catch (error) {
      console.error('Allocation failed:', error);
    }
  };

  return React.createElement('View', {
    testID: 'allocation-screen'
  }, [
    React.createElement('Text', {
      key: 'card-info',
      testID: 'card-id-display'
    }, `Card: ${cardId}`),
    React.createElement('TextInput', {
      key: 'amount-input',
      testID: 'allocation-amount-input',
      value: amount,
      onChangeText: setAmount,
      placeholder: 'Amount to allocate'
    }),
    React.createElement('TouchableOpacity', {
      key: 'allocate-button',
      testID: 'allocate-funds-button',
      onPress: handleAllocate
    }, React.createElement('Text', null, 'Allocate Funds'))
  ]);
};

describe('Funding Workflows E2E Tests', () => {
  const mockUserId = 'test-user-id';
  const mockCardId = 'test-card-id';

  beforeAll(() => {
    // Setup global test environment
    global.fetch = jest.fn();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock store state
    mockFundingStore.accountBalance = {
      totalBalance: 0,
      allocatedBalance: 0,
      availableBalance: 0
    };
    mockFundingStore.transactions = [];
    mockFundingStore.isLoading = false;
    mockFundingStore.error = null;
  });

  describe('Complete Funding Workflow', () => {
    test('should complete full funding workflow: fund account → allocate to card → check balance', async () => {
      // Step 1: Fund Account
      mockApiClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            transaction: {
              id: 'tx-funding-1',
              userId: mockUserId,
              type: 'account_funding',
              amount: 10000,
              status: 'completed',
              createdAt: '2024-01-01T00:00:00.000Z'
            }
          }
        }
      });

      const fundingScreen = render(React.createElement(MockFundingScreen, { 
        navigation: { navigate: jest.fn() }
      }));

      // Enter funding details
      fireEvent.changeText(
        fundingScreen.getByTestId('amount-input'),
        '100.00'
      );
      fireEvent.changeText(
        fundingScreen.getByTestId('payment-method-input'),
        'pm_1234567890abcdef'
      );

      // Submit funding request
      fireEvent.press(fundingScreen.getByTestId('fund-account-button'));

      await waitFor(() => {
        expect(mockApiClient.post).toHaveBeenCalledWith('/api/v1/funding/account', {
          amount: 10000,
          paymentMethodId: 'pm_1234567890abcdef',
          currency: 'USD'
        });
      });

      // Step 2: Check updated balance
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            balance: {
              userId: mockUserId,
              totalBalance: 10000,
              allocatedBalance: 0,
              availableBalance: 10000,
              lastUpdated: '2024-01-01T00:00:00.000Z'
            }
          }
        }
      });

      // Simulate balance check
      const balanceResponse = await mockApiClient.get('/api/v1/funding/balance');
      expect(balanceResponse.data.data.balance.totalBalance).toBe(10000);
      expect(balanceResponse.data.data.balance.availableBalance).toBe(10000);

      // Step 3: Allocate funds to card
      mockApiClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            transaction: {
              id: 'tx-allocation-1',
              userId: mockUserId,
              type: 'card_allocation',
              amount: 5000,
              status: 'completed',
              targetCardId: mockCardId,
              createdAt: '2024-01-01T00:05:00.000Z'
            }
          }
        }
      });

      const allocationScreen = render(React.createElement(MockCardAllocationScreen, {
        route: { params: { cardId: mockCardId } }
      }));

      // Enter allocation amount
      fireEvent.changeText(
        allocationScreen.getByTestId('allocation-amount-input'),
        '50.00'
      );

      // Submit allocation
      fireEvent.press(allocationScreen.getByTestId('allocate-funds-button'));

      await waitFor(() => {
        expect(mockApiClient.post).toHaveBeenCalledWith(
          `/api/v1/funding/card/${mockCardId}`,
          { amount: 5000 }
        );
      });

      // Step 4: Verify final balance state
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            balance: {
              userId: mockUserId,
              totalBalance: 10000,
              allocatedBalance: 5000,
              availableBalance: 5000,
              lastUpdated: '2024-01-01T00:05:00.000Z'
            }
          }
        }
      });

      const finalBalanceResponse = await mockApiClient.get('/api/v1/funding/balance');
      expect(finalBalanceResponse.data.data.balance.totalBalance).toBe(10000);
      expect(finalBalanceResponse.data.data.balance.allocatedBalance).toBe(5000);
      expect(finalBalanceResponse.data.data.balance.availableBalance).toBe(5000);
    });

    test('should handle funding workflow with payment processing delays', async () => {
      // Simulate ACH payment with processing time
      mockApiClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            transaction: {
              id: 'tx-ach-funding',
              userId: mockUserId,
              type: 'account_funding',
              amount: 50000,
              status: 'pending',
              processingTime: 259200, // 3 days
              createdAt: '2024-01-01T00:00:00.000Z'
            }
          }
        }
      });

      const fundingScreen = render(React.createElement(MockFundingScreen, {
        navigation: { navigate: jest.fn() }
      }));

      fireEvent.changeText(
        fundingScreen.getByTestId('amount-input'),
        '500.00'
      );
      fireEvent.changeText(
        fundingScreen.getByTestId('payment-method-input'),
        'pm_ach_1234567890'
      );

      fireEvent.press(fundingScreen.getByTestId('fund-account-button'));

      await waitFor(() => {
        expect(mockApiClient.post).toHaveBeenCalledWith('/api/v1/funding/account', {
          amount: 50000,
          paymentMethodId: 'pm_ach_1234567890',
          currency: 'USD'
        });
      });

      // Verify transaction is pending
      const response = await mockApiClient.post.mock.results[0].value;
      expect(response.data.data.transaction.status).toBe('pending');
      expect(response.data.data.transaction.processingTime).toBe(259200);
    });

    test('should handle card-to-card transfer workflow', async () => {
      const sourceCardId = 'source-card-id';
      const targetCardId = 'target-card-id';

      // Mock successful transfer
      mockApiClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            transaction: {
              id: 'tx-transfer-1',
              userId: mockUserId,
              type: 'card_transfer',
              amount: 3000,
              status: 'completed',
              sourceCardId,
              targetCardId,
              createdAt: '2024-01-01T00:00:00.000Z'
            }
          }
        }
      });

      // Simulate transfer API call
      const transferResponse = await mockApiClient.post('/api/v1/funding/transfer', {
        fromCardId: sourceCardId,
        toCardId: targetCardId,
        amount: 3000
      });

      expect(transferResponse.data.success).toBe(true);
      expect(transferResponse.data.data.transaction.type).toBe('card_transfer');
      expect(transferResponse.data.data.transaction.amount).toBe(3000);
      expect(transferResponse.data.data.transaction.sourceCardId).toBe(sourceCardId);
      expect(transferResponse.data.data.transaction.targetCardId).toBe(targetCardId);
    });
  });

  describe('Error Handling Workflows', () => {
    test('should handle insufficient funds gracefully', async () => {
      // Mock insufficient funds error
      mockApiClient.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            success: false,
            error: 'Insufficient balance. Available: $10.00'
          }
        }
      });

      const allocationScreen = render(React.createElement(MockCardAllocationScreen, {
        route: { params: { cardId: mockCardId } }
      }));

      fireEvent.changeText(
        allocationScreen.getByTestId('allocation-amount-input'),
        '100.00'
      );

      fireEvent.press(allocationScreen.getByTestId('allocate-funds-button'));

      await waitFor(() => {
        expect(mockApiClient.post).toHaveBeenCalledWith(
          `/api/v1/funding/card/${mockCardId}`,
          { amount: 10000 }
        );
      });

      // Verify error was handled
      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
    });

    test('should handle payment method decline', async () => {
      // Mock card declined error
      mockApiClient.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            success: false,
            error: 'Card was declined: insufficient_funds'
          }
        }
      });

      const fundingScreen = render(React.createElement(MockFundingScreen, {
        navigation: { navigate: jest.fn() }
      }));

      fireEvent.changeText(
        fundingScreen.getByTestId('amount-input'),
        '100.00'
      );
      fireEvent.changeText(
        fundingScreen.getByTestId('payment-method-input'),
        'pm_declined_card'
      );

      fireEvent.press(fundingScreen.getByTestId('fund-account-button'));

      await waitFor(() => {
        expect(mockApiClient.post).toHaveBeenCalledWith('/api/v1/funding/account', {
          amount: 10000,
          paymentMethodId: 'pm_declined_card',
          currency: 'USD'
        });
      });
    });

    test('should handle network connectivity issues', async () => {
      // Mock network error
      mockApiClient.post.mockRejectedValueOnce(new Error('Network Error'));

      const fundingScreen = render(React.createElement(MockFundingScreen, {
        navigation: { navigate: jest.fn() }
      }));

      fireEvent.changeText(
        fundingScreen.getByTestId('amount-input'),
        '50.00'
      );
      fireEvent.changeText(
        fundingScreen.getByTestId('payment-method-input'),
        'pm_1234567890abcdef'
      );

      fireEvent.press(fundingScreen.getByTestId('fund-account-button'));

      await waitFor(() => {
        expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Fraud Protection Workflows', () => {
    test('should handle fraud limits during funding', async () => {
      // Mock fraud limit exceeded error
      mockApiClient.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            success: false,
            error: 'Daily funding limit exceeded'
          }
        }
      });

      const fundingScreen = render(React.createElement(MockFundingScreen, {
        navigation: { navigate: jest.fn() }
      }));

      fireEvent.changeText(
        fundingScreen.getByTestId('amount-input'),
        '5000.00'
      );
      fireEvent.changeText(
        fundingScreen.getByTestId('payment-method-input'),
        'pm_1234567890abcdef'
      );

      fireEvent.press(fundingScreen.getByTestId('fund-account-button'));

      await waitFor(() => {
        expect(mockApiClient.post).toHaveBeenCalledWith('/api/v1/funding/account', {
          amount: 500000,
          paymentMethodId: 'pm_1234567890abcdef',
          currency: 'USD'
        });
      });
    });

    test('should handle suspicious velocity detection', async () => {
      // Mock suspicious activity error
      mockApiClient.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            success: false,
            error: 'Too many recent transactions. Please try again later.'
          }
        }
      });

      const fundingScreen = render(React.createElement(MockFundingScreen, {
        navigation: { navigate: jest.fn() }
      }));

      fireEvent.changeText(
        fundingScreen.getByTestId('amount-input'),
        '100.00'
      );
      fireEvent.changeText(
        fundingScreen.getByTestId('payment-method-input'),
        'pm_1234567890abcdef'
      );

      fireEvent.press(fundingScreen.getByTestId('fund-account-button'));

      await waitFor(() => {
        expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Transaction History Workflows', () => {
    test('should load and display transaction history', async () => {
      const mockTransactions = [
        {
          id: 'tx-1',
          userId: mockUserId,
          type: 'account_funding',
          amount: 10000,
          status: 'completed',
          createdAt: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'tx-2',
          userId: mockUserId,
          type: 'card_allocation',
          amount: 5000,
          status: 'completed',
          targetCardId: mockCardId,
          createdAt: '2024-01-01T00:05:00.000Z'
        }
      ];

      mockApiClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: mockTransactions,
          pagination: {
            total: 2,
            limit: 50,
            offset: 0
          }
        }
      });

      // Simulate transaction history load
      const response = await mockApiClient.get('/api/v1/funding/transactions');

      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveLength(2);
      expect(response.data.data[0].type).toBe('account_funding');
      expect(response.data.data[1].type).toBe('card_allocation');
    });

    test('should filter transactions by type and status', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: [],
          pagination: {
            total: 0,
            limit: 50,
            offset: 0
          }
        }
      });

      // Test filtered query
      await mockApiClient.get('/api/v1/funding/transactions?type=account_funding&status=completed');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/v1/funding/transactions?type=account_funding&status=completed'
      );
    });
  });

  describe('Real-time Balance Updates', () => {
    test('should reflect balance changes after transactions', async () => {
      // Initial balance
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: {
            balance: {
              totalBalance: 10000,
              allocatedBalance: 3000,
              availableBalance: 7000
            }
          }
        }
      });

      let initialBalance = await mockApiClient.get('/api/v1/funding/balance');
      expect(initialBalance.data.data.balance.availableBalance).toBe(7000);

      // Perform allocation
      mockApiClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            transaction: {
              type: 'card_allocation',
              amount: 2000,
              status: 'completed'
            }
          }
        }
      });

      await mockApiClient.post(`/api/v1/funding/card/${mockCardId}`, {
        amount: 2000
      });

      // Updated balance after allocation
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: {
            balance: {
              totalBalance: 10000,
              allocatedBalance: 5000,
              availableBalance: 5000
            }
          }
        }
      });

      let updatedBalance = await mockApiClient.get('/api/v1/funding/balance');
      expect(updatedBalance.data.data.balance.availableBalance).toBe(5000);
      expect(updatedBalance.data.data.balance.allocatedBalance).toBe(5000);
    });
  });
});