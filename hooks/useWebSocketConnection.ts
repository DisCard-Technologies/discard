/**
 * useWebSocketConnection Hook
 * Generic WebSocket connection management hook
 *
 * @deprecated This hook is deprecated and will be removed in a future version.
 * Convex provides built-in real-time subscriptions that replace the need for
 * manual WebSocket management. Use Convex's `useQuery` hook for real-time data.
 *
 * For specific use cases, use these Convex-based alternatives:
 * - Crypto rates: `useCryptoRates` from `./useCryptoRatesConvex`
 * - Transactions: `useTransactionSubscription` from `./useTransactionSubscription`
 * - Wallets/DeFi: `useCrypto` from `../stores/cryptoConvex`
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface WebSocketOptions {
  onMessage?: (message: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  protocols?: string | string[];
}

export interface WebSocketHookReturn {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: any;
  send: (message: string | object) => void;
  connect: () => void;
  disconnect: () => void;
  connectionAttempts: number;
}

export const useWebSocketConnection = (
  url: string,
  options: WebSocketOptions = {}
): WebSocketHookReturn => {
  const {
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    protocols
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnect = useRef(true);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.CONNECTING || 
        ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    
    try {
      ws.current = new WebSocket(url, protocols);

      ws.current.onopen = (event) => {
        console.log('WebSocket connected:', url);
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttempts.current = 0;
        setConnectionAttempts(0);
        onOpen?.();
      };

      ws.current.onmessage = (event) => {
        try {
          const data = typeof event.data === 'string' 
            ? JSON.parse(event.data) 
            : event.data;
          
          setLastMessage(data);
          onMessage?.(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          setLastMessage(event.data);
          onMessage?.(event.data);
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket disconnected:', { code: event.code, reason: event.reason });
        setIsConnected(false);
        setIsConnecting(false);
        onClose?.();

        // Attempt to reconnect if it wasn't a manual disconnect
        if (shouldReconnect.current && 
            reconnectAttempts.current < maxReconnectAttempts) {
          
          const timeout = reconnectInterval * Math.pow(1.5, reconnectAttempts.current);
          console.log(`Reconnecting in ${timeout}ms... (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimer.current = setTimeout(() => {
            reconnectAttempts.current++;
            setConnectionAttempts(reconnectAttempts.current);
            connect();
          }, timeout);
        }
      };

      ws.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setIsConnecting(false);
        onError?.(event);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setIsConnecting(false);
    }
  }, [url, protocols, onMessage, onOpen, onClose, onError, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    shouldReconnect.current = false;
    
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }

    if (ws.current) {
      ws.current.close(1000, 'Manual disconnect');
      ws.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    reconnectAttempts.current = 0;
    setConnectionAttempts(0);
  }, []);

  const send = useCallback((message: string | object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const payload = typeof message === 'string' 
        ? message 
        : JSON.stringify(message);
      
      ws.current.send(payload);
    } else {
      console.warn('WebSocket is not connected. Cannot send message:', message);
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    shouldReconnect.current = true;
    connect();

    // Cleanup on unmount
    return () => {
      shouldReconnect.current = false;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  // Handle visibility changes to manage connection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background - we might want to keep connection
        console.log('App backgrounded - maintaining WebSocket connection');
      } else {
        // App came to foreground - ensure connection is active
        console.log('App foregrounded - checking WebSocket connection');
        if (!isConnected && !isConnecting) {
          shouldReconnect.current = true;
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isConnected, isConnecting, connect]);

  // Periodic health check
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        send({ type: 'PING', timestamp: new Date().toISOString() });
      }
    }, 30000); // Ping every 30 seconds

    return () => clearInterval(pingInterval);
  }, [isConnected, send]);

  return {
    isConnected,
    isConnecting,
    lastMessage,
    send,
    connect,
    disconnect,
    connectionAttempts
  };
};