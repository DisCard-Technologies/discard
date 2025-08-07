/**
 * useCryptoRatesWebSocket Hook
 * React hook for managing WebSocket cryptocurrency rate updates
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { CryptoRate, CryptoWalletError, CRYPTO_ERROR_CODES } from '@discard/shared';

interface UseCryptoRatesWebSocketOptions {
  symbols?: string[];
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  onError?: (error: CryptoWalletError) => void;
}

interface WebSocketState {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  reconnectAttempts: number;
  lastHeartbeat: Date | null;
  error: string | null;
}

interface UseCryptoRatesWebSocketReturn {
  // State
  rates: CryptoRate[];
  webSocketState: WebSocketState;
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  clearError: () => void;
  
  // Utilities
  getRateBySymbol: (symbol: string) => CryptoRate | null;
  getLatestRates: () => CryptoRate[];
  isSymbolSupported: (symbol: string) => boolean;
}

export const useCryptoRatesWebSocket = (
  options: UseCryptoRatesWebSocketOptions = {}
): UseCryptoRatesWebSocketReturn => {
  const {
    symbols = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP'],
    autoReconnect = true,
    maxReconnectAttempts = 5,
    onError,
  } = options;

  // State
  const [rates, setRates] = useState<CryptoRate[]>([]);
  const [webSocketState, setWebSocketState] = useState<WebSocketState>({
    isConnected: false,
    connectionStatus: 'disconnected',
    reconnectAttempts: 0,
    lastHeartbeat: null,
    error: null,
  });

  // Refs
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isManualDisconnectRef = useRef(false);
  const mountedRef = useRef(true);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Clear timers
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // Close WebSocket
    if (websocketRef.current) {
      websocketRef.current.onopen = null;
      websocketRef.current.onmessage = null;
      websocketRef.current.onclose = null;
      websocketRef.current.onerror = null;

      if (websocketRef.current.readyState === WebSocket.OPEN) {
        websocketRef.current.close();
      }
      
      websocketRef.current = null;
    }
  }, []);

  // Get auth token
  const getAuthToken = useCallback(async (): Promise<string> => {
    // This would integrate with your auth system
    return 'mock-token';
  }, []);

  // Get WebSocket URL
  const getWebSocketUrl = useCallback(async (): Promise<string> => {
    const token = await getAuthToken();
    const baseUrl = 'ws://localhost:3000'; // This would come from config
    const symbolsQuery = symbols.join(',');
    return `${baseUrl}/ws/crypto/rates?token=${token}&symbols=${symbolsQuery}`;
  }, [symbols, getAuthToken]);

  // Send message to WebSocket
  const sendMessage = useCallback((message: any) => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      try {
        websocketRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
      }
    }
  }, []);

  // Start heartbeat mechanism
  const startHeartbeat = useCallback(() => {
    heartbeatIntervalRef.current = setInterval(() => {
      if (websocketRef.current?.readyState === WebSocket.OPEN) {
        sendMessage({
          type: 'ping',
          timestamp: new Date().toISOString(),
        });

        // Check for heartbeat timeout
        if (mountedRef.current) {
          setWebSocketState(prev => {
            const now = new Date();
            if (prev.lastHeartbeat && (now.getTime() - prev.lastHeartbeat.getTime()) > 60000) {
              console.warn('Heartbeat timeout detected, reconnecting...');
              // Trigger reconnection
              setTimeout(() => reconnect(), 100);
            }
            return prev;
          });
        }
      }
    }, 30000);
  }, [sendMessage]);

  // Handle WebSocket open
  const handleOpen = useCallback(() => {
    console.log('WebSocket connected for crypto rates');
    
    if (mountedRef.current) {
      setWebSocketState(prev => ({
        ...prev,
        isConnected: true,
        connectionStatus: 'connected',
        reconnectAttempts: 0,
        lastHeartbeat: new Date(),
        error: null,
      }));
    }

    startHeartbeat();

    // Send subscription message
    sendMessage({
      type: 'subscribe',
      symbols: symbols,
    });
  }, [startHeartbeat, sendMessage, symbols]);

  // Handle WebSocket message
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);

      if (!mountedRef.current) return;

      switch (message.type) {
        case 'rate_update':
          const validRates = message.data.filter((rate: CryptoRate) => 
            rate.symbol &&
            rate.usdPrice &&
            !isNaN(parseFloat(rate.usdPrice)) &&
            rate.timestamp
          );

          if (validRates.length > 0) {
            setRates(prevRates => {
              const newRates = [...prevRates];
              
              validRates.forEach((newRate: CryptoRate) => {
                const existingIndex = newRates.findIndex(r => r.symbol === newRate.symbol);
                if (existingIndex >= 0) {
                  newRates[existingIndex] = newRate;
                } else {
                  newRates.push(newRate);
                }
              });

              return newRates;
            });
          }
          break;

        case 'connection_status':
          setWebSocketState(prev => ({
            ...prev,
            connectionStatus: message.data.status || prev.connectionStatus,
          }));
          break;

        case 'error':
          const walletError: CryptoWalletError = {
            code: CRYPTO_ERROR_CODES.RATE_FETCH_FAILED,
            message: message.data.message || 'WebSocket rate update error',
            details: message.data,
          };
          onError?.(walletError);
          break;
      }

      // Update heartbeat timestamp
      setWebSocketState(prev => ({
        ...prev,
        lastHeartbeat: new Date(),
      }));

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, [onError]);

  // Handle WebSocket close
  const handleClose = useCallback((event: CloseEvent) => {
    console.log('WebSocket closed:', event.code, event.reason);
    
    websocketRef.current = null;

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (mountedRef.current) {
      setWebSocketState(prev => ({
        ...prev,
        isConnected: false,
        connectionStatus: 'disconnected',
      }));
    }

    // Only attempt reconnection if not manually disconnected and component is mounted
    if (!isManualDisconnectRef.current && autoReconnect && mountedRef.current) {
      attemptReconnect();
    }
  }, [autoReconnect]);

  // Handle WebSocket error
  const handleError = useCallback((error: any) => {
    console.error('WebSocket error:', error);
    
    if (mountedRef.current) {
      setWebSocketState(prev => ({
        ...prev,
        isConnected: false,
        connectionStatus: 'error',
        error: 'WebSocket connection error',
      }));
    }

    const walletError: CryptoWalletError = {
      code: CRYPTO_ERROR_CODES.NETWORK_ERROR,
      message: 'WebSocket connection error',
      details: { originalError: error },
    };

    onError?.(walletError);

    if (!isManualDisconnectRef.current && autoReconnect && mountedRef.current) {
      attemptReconnect();
    }
  }, [onError, autoReconnect]);

  // Attempt reconnection with exponential backoff
  const attemptReconnect = useCallback(() => {
    if (!mountedRef.current) return;

    setWebSocketState(prev => {
      if (prev.reconnectAttempts >= maxReconnectAttempts) {
        console.log('Max reconnection attempts reached');
        return {
          ...prev,
          connectionStatus: 'error',
          error: 'Max reconnection attempts reached',
        };
      }

      const delay = Math.min(1000 * Math.pow(2, prev.reconnectAttempts), 30000);
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${prev.reconnectAttempts + 1})`);

      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, delay);

      return {
        ...prev,
        reconnectAttempts: prev.reconnectAttempts + 1,
      };
    });
  }, [maxReconnectAttempts]);

  // Connect function
  const connect = useCallback(async () => {
    if (websocketRef.current?.readyState === WebSocket.OPEN || !mountedRef.current) {
      return;
    }

    try {
      setWebSocketState(prev => ({
        ...prev,
        connectionStatus: 'connecting',
        error: null,
      }));
      
      isManualDisconnectRef.current = false;

      const url = await getWebSocketUrl();
      const websocket = new WebSocket(url);

      websocket.onopen = handleOpen;
      websocket.onmessage = handleMessage;
      websocket.onclose = handleClose;
      websocket.onerror = handleError;

      websocketRef.current = websocket;

    } catch (error) {
      handleError(error);
    }
  }, [getWebSocketUrl, handleOpen, handleMessage, handleClose, handleError]);

  // Disconnect function
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    cleanup();
    
    if (mountedRef.current) {
      setWebSocketState(prev => ({
        ...prev,
        isConnected: false,
        connectionStatus: 'disconnected',
        error: null,
      }));
    }
  }, [cleanup]);

  // Reconnect function
  const reconnect = useCallback(() => {
    cleanup();
    setTimeout(() => connect(), 100);
  }, [cleanup, connect]);

  // Clear error function
  const clearError = useCallback(() => {
    setWebSocketState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  // Utility functions
  const getRateBySymbol = useCallback((symbol: string): CryptoRate | null => {
    return rates.find(rate => rate.symbol === symbol) || null;
  }, [rates]);

  const getLatestRates = useCallback((): CryptoRate[] => {
    return [...rates];
  }, [rates]);

  const isSymbolSupported = useCallback((symbol: string): boolean => {
    return symbols.includes(symbol);
  }, [symbols]);

  // Auto-connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [connect, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return {
    rates,
    webSocketState,
    connect,
    disconnect,
    reconnect,
    clearError,
    getRateBySymbol,
    getLatestRates,
    isSymbolSupported,
  };
};