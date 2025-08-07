/**
 * Crypto Wallet State Management Store
 * Manages state for cryptocurrency wallets, balances, and connections
 */

import { create } from 'zustand';
import {
  CryptoWallet,
  WalletBalanceResponse,
  ConversionRates,
  WalletSessionInfo,
  CryptoWalletError,
  CRYPTO_ERROR_CODES,
  ConversionCalculatorRequest,
  ConversionCalculatorResponse,
  ConversionQuote,
  RateComparisonRequest,
  RateComparisonResponse,
  HistoricalRateRequest,
  HistoricalRateResponse,
} from '@discard/shared';

interface CryptoState {
  // Wallet State
  connectedWallets: CryptoWallet[];
  walletBalances: Record<string, WalletBalanceResponse>;
  conversionRates: ConversionRates;
  activeSessions: WalletSessionInfo[];
  
  // Conversion State
  activeConversionQuote: ConversionQuote | null;
  rateComparison: RateComparisonResponse | null;
  historicalRates: Record<string, HistoricalRateResponse>; // keyed by symbol
  
  // WebSocket State
  wsConnected: boolean;
  wsReconnectAttempts: number;
  
  // UI State
  isLoading: boolean;
  isConnecting: boolean;
  isRefreshing: boolean;
  isCalculatingConversion: boolean;
  isComparingRates: boolean;
  
  // Error State
  error: string | null;
  walletErrors: Record<string, string>;
  conversionError: string | null;
  
  // Cache State
  lastBalanceUpdate: Date | null;
  lastRateUpdate: Date | null;
  autoRefreshEnabled: boolean;
  refreshInterval: number; // milliseconds
}

interface CryptoActions {
  // Wallet Management
  loadWallets: () => Promise<void>;
  connectWallet: (walletType: string, connectionData: any) => Promise<CryptoWallet | null>;
  disconnectWallet: (walletId: string) => Promise<boolean>;
  refreshWalletBalance: (walletId: string) => Promise<void>;
  refreshAllBalances: () => Promise<void>;
  
  // Balance and Rates
  loadConversionRates: () => Promise<void>;
  getTotalPortfolioValue: () => number;
  getWalletBalance: (walletId: string) => WalletBalanceResponse | null;
  
  // Conversion Actions
  calculateConversion: (request: ConversionCalculatorRequest) => Promise<ConversionCalculatorResponse | null>;
  compareRates: (request: RateComparisonRequest) => Promise<RateComparisonResponse | null>;
  getHistoricalRates: (request: HistoricalRateRequest) => Promise<HistoricalRateResponse | null>;
  createConversionQuote: (fromCrypto: string, toUsd: number, slippageLimit?: number) => Promise<ConversionQuote | null>;
  getConversionQuote: (quoteId: string) => Promise<ConversionQuote | null>;
  cancelConversionQuote: (quoteId: string) => Promise<boolean>;
  clearActiveQuote: () => void;
  
  // WebSocket Actions
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  handleRateUpdate: (rates: ConversionRates) => void;
  
  // Session Management
  loadActiveSessions: () => Promise<void>;
  cleanupExpiredSessions: () => Promise<void>;
  
  // UI Actions
  setError: (error: string | null) => void;
  setWalletError: (walletId: string, error: string | null) => void;
  setConversionError: (error: string | null) => void;
  clearAllErrors: () => void;
  setAutoRefresh: (enabled: boolean, interval?: number) => void;
  
  // Utility Actions
  reset: () => void;
}

type CryptoStore = CryptoState & CryptoActions;

const initialState: CryptoState = {
  connectedWallets: [],
  walletBalances: {},
  conversionRates: {},
  activeSessions: [],
  activeConversionQuote: null,
  rateComparison: null,
  historicalRates: {},
  wsConnected: false,
  wsReconnectAttempts: 0,
  isLoading: false,
  isConnecting: false,
  isRefreshing: false,
  isCalculatingConversion: false,
  isComparingRates: false,
  error: null,
  walletErrors: {},
  conversionError: null,
  lastBalanceUpdate: null,
  lastRateUpdate: null,
  autoRefreshEnabled: true,
  refreshInterval: 30000, // 30 seconds
};

const useCrypto = create<CryptoStore>((set, get) => {
  let refreshTimer: NodeJS.Timeout | null = null;

  const getAuthToken = async (): Promise<string> => {
    // This would integrate with your auth system
    // For now, returning a placeholder
    return 'mock-token';
  };

  const startAutoRefresh = () => {
    const { autoRefreshEnabled, refreshInterval } = get();
    
    // Clear any existing timer first
    stopAutoRefresh();
    
    if (autoRefreshEnabled && refreshInterval > 0) {
      refreshTimer = setInterval(() => {
        const { refreshAllBalances, loadConversionRates } = get();
        refreshAllBalances();
        loadConversionRates();
      }, refreshInterval);
    }
  };

  const stopAutoRefresh = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  return {
    ...initialState,

    // Wallet Management Actions
    loadWallets: async () => {
      set({ isLoading: true, error: null });
      
      try {
        const response = await fetch('/api/v1/crypto/wallets', {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to load wallets');
        }

        const data = await response.json();
        const wallets = data.data.wallets;
        
        set({ 
          connectedWallets: wallets,
          isLoading: false 
        });

        // Load balances for all wallets
        const { refreshAllBalances } = get();
        await refreshAllBalances();

        // Start auto-refresh if enabled
        startAutoRefresh();

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load wallets';
        set({ 
          error: errorMessage,
          isLoading: false 
        });
        console.error('Load wallets error:', error);
      }
    },

    connectWallet: async (walletType: string, connectionData: any): Promise<CryptoWallet | null> => {
      set({ isConnecting: true, error: null });
      
      try {
        let endpoint = '';
        let payload = connectionData;

        switch (walletType) {
          case 'metamask':
            endpoint = '/api/v1/crypto/metamask/connect';
            break;
          case 'walletconnect':
            endpoint = '/api/v1/crypto/walletconnect/propose';
            break;
          case 'bitcoin':
            endpoint = '/api/v1/crypto/bitcoin/connect';
            break;
          default:
            throw new Error(`Unsupported wallet type: ${walletType}`);
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to connect wallet');
        }

        const data = await response.json();
        const wallet = data.data.wallet;

        // Add to connected wallets
        set(state => ({
          connectedWallets: [...state.connectedWallets, wallet],
          isConnecting: false,
        }));

        // Load balance for the new wallet
        const { refreshWalletBalance } = get();
        await refreshWalletBalance(wallet.walletId);

        return wallet;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';
        set({ 
          error: errorMessage,
          isConnecting: false 
        });
        console.error('Connect wallet error:', error);
        return null;
      }
    },

    disconnectWallet: async (walletId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/v1/crypto/wallets/${walletId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to disconnect wallet');
        }

        // Remove from state
        set(state => ({
          connectedWallets: state.connectedWallets.filter(w => w.walletId !== walletId),
          walletBalances: Object.fromEntries(
            Object.entries(state.walletBalances).filter(([id]) => id !== walletId)
          ),
          walletErrors: Object.fromEntries(
            Object.entries(state.walletErrors).filter(([id]) => id !== walletId)
          ),
        }));

        return true;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect wallet';
        set({ error: errorMessage });
        console.error('Disconnect wallet error:', error);
        return false;
      }
    },

    refreshWalletBalance: async (walletId: string) => {
      const { setWalletError } = get();
      
      try {
        setWalletError(walletId, null);

        const response = await fetch(`/api/v1/crypto/wallets/${walletId}/balance`, {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to refresh balance');
        }

        const data = await response.json();
        const balance = data.data;

        set(state => ({
          walletBalances: {
            ...state.walletBalances,
            [walletId]: balance,
          },
        }));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to refresh balance';
        setWalletError(walletId, errorMessage);
        console.error(`Refresh balance error for wallet ${walletId}:`, error);
      }
    },

    refreshAllBalances: async () => {
      const { connectedWallets, refreshWalletBalance } = get();
      set({ isRefreshing: true });

      try {
        await Promise.allSettled(
          connectedWallets.map(wallet => refreshWalletBalance(wallet.walletId))
        );

        set({ 
          lastBalanceUpdate: new Date(),
          isRefreshing: false 
        });

      } catch (error) {
        set({ isRefreshing: false });
        console.error('Refresh all balances error:', error);
      }
    },

    // Balance and Rates Actions
    loadConversionRates: async () => {
      try {
        const response = await fetch('/api/v1/crypto/rates', {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          set({ 
            conversionRates: data.data.rates,
            lastRateUpdate: new Date(),
          });
        }
      } catch (error) {
        console.error('Load conversion rates error:', error);
      }
    },

    getTotalPortfolioValue: (): number => {
      const { walletBalances } = get();
      return Object.values(walletBalances).reduce(
        (total, balance) => total + balance.totalUsdValue,
        0
      );
    },

    getWalletBalance: (walletId: string): WalletBalanceResponse | null => {
      const { walletBalances } = get();
      return walletBalances[walletId] || null;
    },

    // Session Management Actions
    loadActiveSessions: async () => {
      try {
        const response = await fetch('/api/v1/crypto/sessions', {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          set({ activeSessions: data.data.sessions });
        }
      } catch (error) {
        console.error('Load active sessions error:', error);
      }
    },

    cleanupExpiredSessions: async () => {
      try {
        const response = await fetch('/api/v1/crypto/sessions/cleanup', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        });

        if (response.ok) {
          const { loadActiveSessions } = get();
          await loadActiveSessions();
        }
      } catch (error) {
        console.error('Cleanup expired sessions error:', error);
      }
    },

    // Conversion Actions
    calculateConversion: async (request: ConversionCalculatorRequest): Promise<ConversionCalculatorResponse | null> => {
      set({ isCalculatingConversion: true, conversionError: null });
      
      try {
        const response = await fetch('/api/v1/crypto/rates/conversion-calculator', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to calculate conversion');
        }

        const data = await response.json();
        set({ isCalculatingConversion: false });
        return data.data;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to calculate conversion';
        set({ 
          conversionError: errorMessage,
          isCalculatingConversion: false 
        });
        console.error('Calculate conversion error:', error);
        return null;
      }
    },

    compareRates: async (request: RateComparisonRequest): Promise<RateComparisonResponse | null> => {
      set({ isComparingRates: true, conversionError: null });
      
      try {
        const response = await fetch('/api/v1/crypto/rates/comparison', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to compare rates');
        }

        const data = await response.json();
        const comparisonData = data.data;
        
        set({ 
          rateComparison: comparisonData,
          isComparingRates: false 
        });
        
        return comparisonData;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to compare rates';
        set({ 
          conversionError: errorMessage,
          isComparingRates: false 
        });
        console.error('Compare rates error:', error);
        return null;
      }
    },

    getHistoricalRates: async (request: HistoricalRateRequest): Promise<HistoricalRateResponse | null> => {
      try {
        const params = new URLSearchParams({
          symbol: request.symbol,
          timeframe: request.timeframe,
          ...(request.resolution && { resolution: request.resolution }),
        });

        const response = await fetch(`/api/v1/crypto/rates/historical?${params}`, {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to get historical rates');
        }

        const data = await response.json();
        const historicalData = data.data;
        
        // Cache historical data by symbol
        set(state => ({
          historicalRates: {
            ...state.historicalRates,
            [request.symbol]: historicalData,
          },
        }));
        
        return historicalData;

      } catch (error) {
        console.error('Get historical rates error:', error);
        return null;
      }
    },

    createConversionQuote: async (fromCrypto: string, toUsd: number, slippageLimit?: number): Promise<ConversionQuote | null> => {
      set({ isCalculatingConversion: true, conversionError: null });
      
      try {
        const response = await fetch('/api/v1/crypto/quotes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
          body: JSON.stringify({
            fromCrypto,
            toUsd,
            slippageLimit,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create conversion quote');
        }

        const data = await response.json();
        const quote = data.data;
        
        set({ 
          activeConversionQuote: quote,
          isCalculatingConversion: false 
        });
        
        return quote;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create conversion quote';
        set({ 
          conversionError: errorMessage,
          isCalculatingConversion: false 
        });
        console.error('Create conversion quote error:', error);
        return null;
      }
    },

    getConversionQuote: async (quoteId: string): Promise<ConversionQuote | null> => {
      try {
        const response = await fetch(`/api/v1/crypto/quotes/${quoteId}`, {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to get conversion quote');
        }

        const data = await response.json();
        return data.data;

      } catch (error) {
        console.error('Get conversion quote error:', error);
        return null;
      }
    },

    cancelConversionQuote: async (quoteId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/v1/crypto/quotes/${quoteId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to cancel conversion quote');
        }

        // Clear active quote if it matches
        const { activeConversionQuote } = get();
        if (activeConversionQuote?.quoteId === quoteId) {
          set({ activeConversionQuote: null });
        }

        return true;

      } catch (error) {
        console.error('Cancel conversion quote error:', error);
        return false;
      }
    },

    clearActiveQuote: () => {
      set({ activeConversionQuote: null });
    },

    // WebSocket Actions
    connectWebSocket: () => {
      const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/crypto/rates`);
      
      ws.onopen = () => {
        set({ wsConnected: true, wsReconnectAttempts: 0 });
        console.log('WebSocket connected for real-time rates');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'rates_update') {
            get().handleRateUpdate(data.data);
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        set({ wsConnected: false });
        
        // Attempt reconnection with exponential backoff
        const { wsReconnectAttempts } = get();
        if (wsReconnectAttempts < 5) {
          const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts), 30000);
          setTimeout(() => {
            set(state => ({ wsReconnectAttempts: state.wsReconnectAttempts + 1 }));
            get().connectWebSocket();
          }, delay);
        }
      };

      // Store WebSocket instance if needed for manual disconnect
      (window as any).__cryptoRatesWS = ws;
    },

    disconnectWebSocket: () => {
      const ws = (window as any).__cryptoRatesWS;
      if (ws) {
        ws.close();
        delete (window as any).__cryptoRatesWS;
      }
      set({ wsConnected: false, wsReconnectAttempts: 0 });
    },

    handleRateUpdate: (rates: ConversionRates) => {
      set(state => ({
        conversionRates: { ...state.conversionRates, ...rates },
        lastRateUpdate: new Date(),
      }));
    },

    // UI Actions
    setError: (error: string | null) => {
      set({ error });
    },

    setConversionError: (error: string | null) => {
      set({ conversionError: error });
    },

    setWalletError: (walletId: string, error: string | null) => {
      set(state => ({
        walletErrors: error 
          ? { ...state.walletErrors, [walletId]: error }
          : Object.fromEntries(
              Object.entries(state.walletErrors).filter(([id]) => id !== walletId)
            ),
      }));
    },

    clearAllErrors: () => {
      set({ error: null, walletErrors: {}, conversionError: null });
    },

    setAutoRefresh: (enabled: boolean, interval?: number) => {
      set(state => ({
        autoRefreshEnabled: enabled,
        refreshInterval: interval || state.refreshInterval,
      }));

      if (enabled) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
    },

    // Utility Actions
    reset: () => {
      stopAutoRefresh();
      set(initialState);
    },
  };
});

// Helper hook for wallet-specific operations
export const useWalletOperations = (walletId: string) => {
  const store = useCrypto();
  
  const wallet = store.connectedWallets.find(w => w.walletId === walletId);
  const balance = store.walletBalances[walletId];
  const error = store.walletErrors[walletId];
  
  return {
    wallet,
    balance,
    error,
    refreshBalance: () => store.refreshWalletBalance(walletId),
    disconnect: () => store.disconnectWallet(walletId),
    clearError: () => store.setWalletError(walletId, null),
  };
};

// Helper hook for portfolio overview
export const usePortfolioOverview = () => {
  const store = useCrypto();
  
  return {
    totalValue: store.getTotalPortfolioValue(),
    walletCount: store.connectedWallets.length,
    lastUpdate: store.lastBalanceUpdate,
    isRefreshing: store.isRefreshing,
    refresh: store.refreshAllBalances,
  };
};

// Helper hook for conversion operations
export const useConversionOperations = () => {
  const store = useCrypto();
  
  return {
    activeQuote: store.activeConversionQuote,
    rateComparison: store.rateComparison,
    isCalculating: store.isCalculatingConversion,
    isComparing: store.isComparingRates,
    error: store.conversionError,
    calculateConversion: store.calculateConversion,
    compareRates: store.compareRates,
    createQuote: store.createConversionQuote,
    cancelQuote: store.cancelConversionQuote,
    clearQuote: store.clearActiveQuote,
    clearError: () => store.setConversionError(null),
  };
};

// Helper hook for real-time rates
export const useRealTimeRates = () => {
  const store = useCrypto();
  
  return {
    rates: store.conversionRates,
    lastUpdate: store.lastRateUpdate,
    wsConnected: store.wsConnected,
    connectWebSocket: store.connectWebSocket,
    disconnectWebSocket: store.disconnectWebSocket,
  };
};

// Helper hook for historical rates
export const useHistoricalRates = (symbol: string) => {
  const store = useCrypto();
  const historicalData = store.historicalRates[symbol];
  
  return {
    data: historicalData,
    loading: !historicalData,
    fetch: (timeframe: '1h' | '24h' | '7d', resolution?: '1m' | '5m' | '1h') => 
      store.getHistoricalRates({ symbol, timeframe, resolution }),
  };
};

export default useCrypto;