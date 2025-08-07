/**
 * CryptoRatesWebSocket Component for React Native
 * Real-time cryptocurrency rate updates using WebSocket connections
 */

import React, { useState, useEffect, useRef } from 'react';
import { CryptoRate, CryptoWalletError, CRYPTO_ERROR_CODES } from '@discard/shared';

interface CryptoRatesWebSocketProps {
  onRateUpdate?: (rates: CryptoRate[]) => void;
  onConnectionStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  onError?: (error: CryptoWalletError) => void;
  symbols?: string[]; // Optional filter for specific symbols
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

interface WebSocketMessage {
  type: 'rate_update' | 'connection_status' | 'error';
  data: any;
  timestamp: string;
}

const CryptoRatesWebSocket: React.FC<CryptoRatesWebSocketProps> = ({
  onRateUpdate,
  onConnectionStatusChange,
  onError,
  symbols = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP'],
  autoReconnect = true,
  maxReconnectAttempts = 5,
}) => {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);

  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isManualDisconnectRef = useRef(false);

  useEffect(() => {
    connect();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    onConnectionStatusChange?.(connectionStatus);
  }, [connectionStatus, onConnectionStatusChange]);

  const getAuthToken = async (): Promise<string> => {
    // This would integrate with your auth system
    return 'mock-token';
  };

  const getWebSocketUrl = async (): Promise<string> => {
    const token = await getAuthToken();
    const baseUrl = 'ws://localhost:3000'; // This would come from config
    const symbolsQuery = symbols.join(',');
    return `${baseUrl}/ws/crypto/rates?token=${token}&symbols=${symbolsQuery}`;
  };

  const connect = async () => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      setConnectionStatus('connecting');
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
  };

  const disconnect = () => {
    isManualDisconnectRef.current = true;
    cleanup();
    setConnectionStatus('disconnected');
  };

  const cleanup = () => {
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
  };

  const handleOpen = () => {
    console.log('WebSocket connected for crypto rates');
    setConnectionStatus('connected');
    setReconnectAttempts(0);
    setLastHeartbeat(new Date());

    // Start heartbeat
    startHeartbeat();

    // Send subscription message
    sendMessage({
      type: 'subscribe',
      symbols: symbols,
    });
  };

  const handleMessage = (event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'rate_update':
          handleRateUpdate(message.data);
          break;

        case 'connection_status':
          handleConnectionStatusMessage(message.data);
          break;

        case 'error':
          handleErrorMessage(message.data);
          break;

        default:
          console.warn('Unknown WebSocket message type:', message.type);
      }

      // Update last heartbeat timestamp
      setLastHeartbeat(new Date());

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  const handleClose = (event: CloseEvent) => {
    console.log('WebSocket closed:', event.code, event.reason);
    
    if (websocketRef.current) {
      websocketRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // Only attempt reconnection if not manually disconnected
    if (!isManualDisconnectRef.current && autoReconnect) {
      setConnectionStatus('disconnected');
      attemptReconnect();
    } else {
      setConnectionStatus('disconnected');
    }
  };

  const handleError = (error: any) => {
    console.error('WebSocket error:', error);
    setConnectionStatus('error');

    const walletError: CryptoWalletError = {
      code: CRYPTO_ERROR_CODES.NETWORK_ERROR,
      message: 'WebSocket connection error',
      details: { originalError: error },
    };

    onError?.(walletError);

    if (!isManualDisconnectRef.current && autoReconnect) {
      attemptReconnect();
    }
  };

  const handleRateUpdate = (rates: CryptoRate[]) => {
    // Validate rate data
    const validRates = rates.filter(rate => 
      rate.symbol &&
      rate.usdPrice &&
      !isNaN(parseFloat(rate.usdPrice)) &&
      rate.timestamp
    );

    if (validRates.length > 0) {
      onRateUpdate?.(validRates);
    }
  };

  const handleConnectionStatusMessage = (statusData: any) => {
    if (statusData.status) {
      setConnectionStatus(statusData.status);
    }
  };

  const handleErrorMessage = (errorData: any) => {
    const walletError: CryptoWalletError = {
      code: CRYPTO_ERROR_CODES.RATE_FETCH_FAILED,
      message: errorData.message || 'WebSocket rate update error',
      details: errorData,
    };

    onError?.(walletError);
  };

  const attemptReconnect = () => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      setConnectionStatus('error');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttempts(prev => prev + 1);
      connect();
    }, delay);
  };

  const startHeartbeat = () => {
    // Send ping every 30 seconds to keep connection alive
    heartbeatIntervalRef.current = setInterval(() => {
      if (websocketRef.current?.readyState === WebSocket.OPEN) {
        sendMessage({
          type: 'ping',
          timestamp: new Date().toISOString(),
        });

        // Check if we've received a heartbeat recently
        const now = new Date();
        if (lastHeartbeat && (now.getTime() - lastHeartbeat.getTime()) > 60000) {
          console.warn('Heartbeat timeout detected, reconnecting...');
          cleanup();
          connect();
        }
      }
    }, 30000);
  };

  const sendMessage = (message: any) => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      try {
        websocketRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
      }
    }
  };

  // Expose methods for external control
  const webSocketControls = {
    connect,
    disconnect,
    reconnect: () => {
      cleanup();
      connect();
    },
    isConnected: () => connectionStatus === 'connected',
    getConnectionStatus: () => connectionStatus,
    getReconnectAttempts: () => reconnectAttempts,
    getLastHeartbeat: () => lastHeartbeat,
  };

  // This component doesn't render anything - it's purely for WebSocket management
  return null;
};

// Higher-order component to provide WebSocket functionality
export const withCryptoRatesWebSocket = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return (props: P & CryptoRatesWebSocketProps) => {
    const {
      onRateUpdate,
      onConnectionStatusChange,
      onError,
      symbols,
      autoReconnect,
      maxReconnectAttempts,
      ...componentProps
    } = props;

    return (
      <>
        <CryptoRatesWebSocket
          onRateUpdate={onRateUpdate}
          onConnectionStatusChange={onConnectionStatusChange}
          onError={onError}
          symbols={symbols}
          autoReconnect={autoReconnect}
          maxReconnectAttempts={maxReconnectAttempts}
        />
        <Component {...(componentProps as P)} />
      </>
    );
  };
};

export default CryptoRatesWebSocket;