/**
 * Funding management state store for React Native mobile app
 * Provides funding operations with balance management and transaction tracking
 */

import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { 
  AccountFundingRequest, 
  CardAllocationRequest, 
  CardTransferRequest,
  AccountBalance,
  CardBalance,
  FundingTransaction,
  BalanceNotificationThreshold,
  FundingRequestOptions
} from '@discard/shared';

// API base URL - should be moved to environment config
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export interface FundingState {
  // Balance data
  accountBalance: AccountBalance | null;
  cardBalances: { [cardId: string]: CardBalance };
  
  // Transaction data
  transactions: FundingTransaction[];
  selectedTransaction: FundingTransaction | null;
  
  // Notification settings
  notificationThresholds: BalanceNotificationThreshold | null;
  
  // Loading states
  isLoadingBalance: boolean;
  isLoadingTransactions: boolean;
  isFunding: boolean;
  isAllocating: boolean;
  isTransferring: boolean;
  
  // Error states
  error: string | null;
  fundingError: string | null;
  allocationError: string | null;
  transferError: string | null;
}

type FundingAction =
  | { type: 'SET_LOADING_BALANCE'; payload: boolean }
  | { type: 'SET_LOADING_TRANSACTIONS'; payload: boolean }
  | { type: 'SET_FUNDING_LOADING'; payload: boolean }
  | { type: 'SET_ALLOCATION_LOADING'; payload: boolean }
  | { type: 'SET_TRANSFER_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_FUNDING_ERROR'; payload: string | null }
  | { type: 'SET_ALLOCATION_ERROR'; payload: string | null }
  | { type: 'SET_TRANSFER_ERROR'; payload: string | null }
  | { type: 'SET_ACCOUNT_BALANCE'; payload: AccountBalance }
  | { type: 'SET_CARD_BALANCE'; payload: { cardId: string; balance: CardBalance } }
  | { type: 'SET_TRANSACTIONS'; payload: FundingTransaction[] }
  | { type: 'ADD_TRANSACTION'; payload: FundingTransaction }
  | { type: 'UPDATE_TRANSACTION'; payload: { id: string; updates: Partial<FundingTransaction> } }
  | { type: 'SELECT_TRANSACTION'; payload: FundingTransaction | null }
  | { type: 'SET_NOTIFICATION_THRESHOLDS'; payload: BalanceNotificationThreshold };

const initialState: FundingState = {
  accountBalance: null,
  cardBalances: {},
  transactions: [],
  selectedTransaction: null,
  notificationThresholds: null,
  isLoadingBalance: false,
  isLoadingTransactions: false,
  isFunding: false,
  isAllocating: false,
  isTransferring: false,
  error: null,
  fundingError: null,
  allocationError: null,
  transferError: null,
};

function fundingReducer(state: FundingState, action: FundingAction): FundingState {
  switch (action.type) {
    case 'SET_LOADING_BALANCE':
      return { ...state, isLoadingBalance: action.payload };
    
    case 'SET_LOADING_TRANSACTIONS':
      return { ...state, isLoadingTransactions: action.payload };
    
    case 'SET_FUNDING_LOADING':
      return { ...state, isFunding: action.payload };
    
    case 'SET_ALLOCATION_LOADING':
      return { ...state, isAllocating: action.payload };
    
    case 'SET_TRANSFER_LOADING':
      return { ...state, isTransferring: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'SET_FUNDING_ERROR':
      return { ...state, fundingError: action.payload };
    
    case 'SET_ALLOCATION_ERROR':
      return { ...state, allocationError: action.payload };
    
    case 'SET_TRANSFER_ERROR':
      return { ...state, transferError: action.payload };
    
    case 'SET_ACCOUNT_BALANCE':
      return { ...state, accountBalance: action.payload };
    
    case 'SET_CARD_BALANCE':
      return {
        ...state,
        cardBalances: {
          ...state.cardBalances,
          [action.payload.cardId]: action.payload.balance,
        },
      };
    
    case 'SET_TRANSACTIONS':
      return { ...state, transactions: action.payload };
    
    case 'ADD_TRANSACTION':
      return { ...state, transactions: [action.payload, ...state.transactions] };
    
    case 'UPDATE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.map(tx =>
          tx.id === action.payload.id
            ? { ...tx, ...action.payload.updates }
            : tx
        ),
        selectedTransaction: state.selectedTransaction?.id === action.payload.id
          ? { ...state.selectedTransaction, ...action.payload.updates }
          : state.selectedTransaction,
      };
    
    case 'SELECT_TRANSACTION':
      return { ...state, selectedTransaction: action.payload };
    
    case 'SET_NOTIFICATION_THRESHOLDS':
      return { ...state, notificationThresholds: action.payload };
    
    default:
      return state;
  }
}

// Context
const FundingContext = createContext<{
  state: FundingState;
  actions: FundingActions;
} | null>(null);

// Actions interface
export interface FundingActions {
  loadBalance: () => Promise<void>;
  loadCardBalance: (cardId: string) => Promise<void>;
  loadTransactions: (options?: FundingRequestOptions) => Promise<void>;
  fundAccount: (request: AccountFundingRequest) => Promise<FundingTransaction | null>;
  allocateToCard: (request: CardAllocationRequest) => Promise<FundingTransaction | null>;
  transferBetweenCards: (request: CardTransferRequest) => Promise<FundingTransaction | null>;
  loadNotificationThresholds: () => Promise<void>;
  updateNotificationThresholds: (updates: Partial<Omit<BalanceNotificationThreshold, 'userId'>>) => Promise<void>;
  selectTransaction: (transaction: FundingTransaction | null) => void;
  clearError: () => void;
  clearFundingError: () => void;
  clearAllocationError: () => void;
  clearTransferError: () => void;
}

// Provider component
export function FundingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(fundingReducer, initialState);

  // Get auth token from secure storage (placeholder for now)
  const getAuthToken = async (): Promise<string | null> => {
    // TODO: Implement actual token retrieval from secure storage
    return 'mock-token';
  };

  // API helper function
  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const token = await getAuthToken();
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  };

  const actions: FundingActions = {
    loadBalance: async () => {
      try {
        dispatch({ type: 'SET_LOADING_BALANCE', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });

        const response = await apiCall('/api/v1/funding/balance');
        dispatch({ type: 'SET_ACCOUNT_BALANCE', payload: response.data.balance });
        
        if (response.data.notificationThresholds) {
          dispatch({ type: 'SET_NOTIFICATION_THRESHOLDS', payload: response.data.notificationThresholds });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load balance';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      } finally {
        dispatch({ type: 'SET_LOADING_BALANCE', payload: false });
      }
    },

    loadCardBalance: async (cardId: string) => {
      try {
        // This would typically come from the cards API
        // For now, we'll extract it from card details
        const response = await apiCall(`/api/v1/cards/${cardId}`);
        const cardBalance: CardBalance = {
          cardId,
          balance: response.data.card.currentBalance,
          lastUpdated: response.data.card.updatedAt,
        };
        
        dispatch({ type: 'SET_CARD_BALANCE', payload: { cardId, balance: cardBalance } });
      } catch (error) {
        console.error('Failed to load card balance:', error);
      }
    },

    loadTransactions: async (options?: FundingRequestOptions) => {
      try {
        dispatch({ type: 'SET_LOADING_TRANSACTIONS', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });

        const queryParams = new URLSearchParams();
        if (options?.status) queryParams.append('status', options.status);
        if (options?.type) queryParams.append('type', options.type);
        if (options?.limit) queryParams.append('limit', options.limit.toString());
        if (options?.offset) queryParams.append('offset', options.offset.toString());
        if (options?.startDate) queryParams.append('startDate', options.startDate);
        if (options?.endDate) queryParams.append('endDate', options.endDate);

        const queryString = queryParams.toString();
        const endpoint = `/api/v1/funding/transactions${queryString ? `?${queryString}` : ''}`;
        
        const response = await apiCall(endpoint);
        dispatch({ type: 'SET_TRANSACTIONS', payload: response.data || [] });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load transactions';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      } finally {
        dispatch({ type: 'SET_LOADING_TRANSACTIONS', payload: false });
      }
    },

    fundAccount: async (request: AccountFundingRequest): Promise<FundingTransaction | null> => {
      try {
        dispatch({ type: 'SET_FUNDING_LOADING', payload: true });
        dispatch({ type: 'SET_FUNDING_ERROR', payload: null });

        const response = await apiCall('/api/v1/funding/account', {
          method: 'POST',
          body: JSON.stringify(request),
        });

        const transaction: FundingTransaction = response.data.transaction;
        dispatch({ type: 'ADD_TRANSACTION', payload: transaction });

        // Refresh balance after funding
        if (transaction.status === 'completed') {
          await actions.loadBalance();
        }

        return transaction;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fund account';
        dispatch({ type: 'SET_FUNDING_ERROR', payload: errorMessage });
        return null;
      } finally {
        dispatch({ type: 'SET_FUNDING_LOADING', payload: false });
      }
    },

    allocateToCard: async (request: CardAllocationRequest): Promise<FundingTransaction | null> => {
      try {
        dispatch({ type: 'SET_ALLOCATION_LOADING', payload: true });
        dispatch({ type: 'SET_ALLOCATION_ERROR', payload: null });

        const response = await apiCall(`/api/v1/funding/card/${request.cardId}`, {
          method: 'POST',
          body: JSON.stringify({ amount: request.amount }),
        });

        const transaction: FundingTransaction = response.data.transaction;
        dispatch({ type: 'ADD_TRANSACTION', payload: transaction });

        // Refresh balance and card balance after allocation
        await actions.loadBalance();
        await actions.loadCardBalance(request.cardId);

        return transaction;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to allocate to card';
        dispatch({ type: 'SET_ALLOCATION_ERROR', payload: errorMessage });
        return null;
      } finally {
        dispatch({ type: 'SET_ALLOCATION_LOADING', payload: false });
      }
    },

    transferBetweenCards: async (request: CardTransferRequest): Promise<FundingTransaction | null> => {
      try {
        dispatch({ type: 'SET_TRANSFER_LOADING', payload: true });
        dispatch({ type: 'SET_TRANSFER_ERROR', payload: null });

        const response = await apiCall('/api/v1/funding/transfer', {
          method: 'POST',
          body: JSON.stringify(request),
        });

        const transaction: FundingTransaction = response.data.transaction;
        dispatch({ type: 'ADD_TRANSACTION', payload: transaction });

        // Refresh card balances after transfer
        await actions.loadCardBalance(request.fromCardId);
        await actions.loadCardBalance(request.toCardId);

        return transaction;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to transfer between cards';
        dispatch({ type: 'SET_TRANSFER_ERROR', payload: errorMessage });
        return null;
      } finally {
        dispatch({ type: 'SET_TRANSFER_LOADING', payload: false });
      }
    },

    loadNotificationThresholds: async () => {
      try {
        // This is typically loaded with balance, but can be called separately
        await actions.loadBalance();
      } catch (error) {
        console.error('Failed to load notification thresholds:', error);
      }
    },

    updateNotificationThresholds: async (updates: Partial<Omit<BalanceNotificationThreshold, 'userId'>>) => {
      try {
        dispatch({ type: 'SET_ERROR', payload: null });

        const response = await apiCall('/api/v1/funding/notifications', {
          method: 'PUT',
          body: JSON.stringify(updates),
        });

        dispatch({ type: 'SET_NOTIFICATION_THRESHOLDS', payload: response.data });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to update notification thresholds';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    },

    selectTransaction: (transaction: FundingTransaction | null) => {
      dispatch({ type: 'SELECT_TRANSACTION', payload: transaction });
    },

    clearError: () => {
      dispatch({ type: 'SET_ERROR', payload: null });
    },

    clearFundingError: () => {
      dispatch({ type: 'SET_FUNDING_ERROR', payload: null });
    },

    clearAllocationError: () => {
      dispatch({ type: 'SET_ALLOCATION_ERROR', payload: null });
    },

    clearTransferError: () => {
      dispatch({ type: 'SET_TRANSFER_ERROR', payload: null });
    },
  };

  return (
    <FundingContext.Provider value={{ state, actions }}>
      {children}
    </FundingContext.Provider>
  );
}

// Hook to use funding context
export function useFunding() {
  const context = useContext(FundingContext);
  if (!context) {
    throw new Error('useFunding must be used within a FundingProvider');
  }
  return context;
}

// Hook for funding operations
export function useFundingOperations() {
  const { actions } = useFunding();
  return actions;
}

// Hook for funding state
export function useFundingState() {
  const { state } = useFunding();
  return state;
}