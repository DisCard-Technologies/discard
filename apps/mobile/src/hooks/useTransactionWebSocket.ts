import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';

interface TransactionHistoryUpdate {
  type: 'transactionHistoryUpdated';
  cardId: string;
  update: {
    type: 'new' | 'status_change' | 'refund';
    transaction: {
      transactionId: string;
      merchantName: string;
      amount: number;
      status: string;
      processedAt: string;
    };
    affectedAnalytics?: {
      totalSpentChange: number;
      categoryChange: { [category: string]: number };
    };
  };
}

interface TransactionFeedUpdate {
  type: 'new_transaction';
  transactionId: string;
  cardContext: string;
  merchantName: string;
  amount: number;
  category: string;
  timestamp: string;
  status: 'authorized' | 'settled' | 'declined';
}

interface SpendingAlert {
  type: 'spending_alert';
  cardContext: string;
  alertType: 'limit_threshold' | 'unusual_pattern' | 'velocity';
  threshold: number;
  currentAmount: number;
  message: string;
  timestamp: string;
}

type WebSocketMessage = TransactionHistoryUpdate | TransactionFeedUpdate | SpendingAlert;

interface ConnectionInfo {
  isConnected: boolean;
  reconnectAttempts: number;
  lastConnectionTime?: Date;
  connectionId?: string;
}

export const useTransactionWebSocket = () => {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    isConnected: false,
    reconnectAttempts: 0,
  });
  const [lastUpdate, setLastUpdate] = useState<WebSocketMessage | null>(null);
  const [subscriptions, setSubscriptions] = useState<Set<string>>(new Set());
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const pendingSubscriptions = useRef<string[]>([]);
  
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 2000; // Start with 2 seconds
  const HEARTBEAT_INTERVAL = 30000; // 30 seconds
  const CONNECTION_TIMEOUT = 60000; // 60 seconds timeout

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    try {
      // In a real app, you'd get this from your auth service/storage
      // For now, returning a placeholder
      return 'your-jwt-token'; // Replace with actual token retrieval
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      const token = await getAuthToken();
      if (!token) {
        console.error('No auth token available, cannot connect to WebSocket');
        return;
      }

      // Clean up existing connection
      if (ws.current) {
        ws.current.close();
      }

      const wsUrl = `ws://localhost:3000/ws/transactions/feed?token=${encodeURIComponent(token)}`;
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setConnectionInfo(prev => ({
          isConnected: true,
          reconnectAttempts: 0,
          lastConnectionTime: new Date(),
          connectionId: prev.connectionId,
        }));

        // Start heartbeat
        startHeartbeat();

        // Resubscribe to pending subscriptions
        const pending = [...pendingSubscriptions.current];
        pendingSubscriptions.current = [];
        pending.forEach(subscription => {
          const [cardId, subscriptionType] = subscription.split(':');
          subscribeToCard(cardId, [subscriptionType]);
        });
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnectionInfo(prev => ({
          ...prev,
          isConnected: false,
        }));

        stopHeartbeat();

        // Attempt reconnection if not a clean close
        if (event.code !== 1000) {
          scheduleReconnect();
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      scheduleReconnect();
    }
  }, [getAuthToken]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }

    setConnectionInfo(prev => {
      if (prev.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached');
        return prev;
      }

      const newAttempts = prev.reconnectAttempts + 1;
      const delay = RECONNECT_DELAY * Math.pow(2, newAttempts - 1); // Exponential backoff

      console.log(`Scheduling reconnection attempt ${newAttempts} in ${delay}ms`);
      
      reconnectTimeout.current = setTimeout(() => {
        connect();
      }, delay);

      return {
        ...prev,
        reconnectAttempts: newAttempts,
      };
    });
  }, [connect]);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'connection_established':
        setConnectionInfo(prev => ({
          ...prev,
          connectionId: message.connectionId,
        }));
        console.log('WebSocket connection established:', message.connectionId);
        break;

      case 'subscription_confirmed':
        const subKey = `${message.cardContext}:${message.subscriptionType}`;
        setSubscriptions(prev => new Set(prev).add(subKey));
        console.log('Subscription confirmed:', subKey);
        break;

      case 'unsubscription_confirmed':
        const unsubKey = `${message.cardContext}:${message.subscriptionType}`;
        setSubscriptions(prev => {
          const newSet = new Set(prev);
          newSet.delete(unsubKey);
          return newSet;
        });
        console.log('Unsubscription confirmed:', unsubKey);
        break;

      case 'heartbeat_ack':
        // Heartbeat acknowledged, connection is healthy
        break;

      case 'transactionHistoryUpdated':
      case 'new_transaction':
      case 'spending_alert':
        // These are the updates we want to pass to components
        setLastUpdate(message);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
    }

    heartbeatInterval.current = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        }));
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  }, []);

  const subscribeToCard = useCallback((cardId: string, types: string[] = ['all']) => {
    types.forEach(subscriptionType => {
      const subscriptionKey = `${cardId}:${subscriptionType}`;
      
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'subscribe',
          cardContext: cardId,
          subscriptionType,
        }));
      } else {
        // Store for when connection is established
        if (!pendingSubscriptions.current.includes(subscriptionKey)) {
          pendingSubscriptions.current.push(subscriptionKey);
        }
      }
    });
  }, []);

  const unsubscribeFromCard = useCallback((cardId: string, types: string[] = ['all']) => {
    types.forEach(subscriptionType => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'unsubscribe',
          cardContext: cardId,
          subscriptionType,
        }));
      }
      
      // Remove from pending subscriptions
      const subscriptionKey = `${cardId}:${subscriptionType}`;
      const index = pendingSubscriptions.current.indexOf(subscriptionKey);
      if (index > -1) {
        pendingSubscriptions.current.splice(index, 1);
      }
    });
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    
    stopHeartbeat();
    
    if (ws.current) {
      ws.current.close(1000, 'Client disconnect');
    }
    
    setConnectionInfo({
      isConnected: false,
      reconnectAttempts: 0,
    });
    setSubscriptions(new Set());
    pendingSubscriptions.current = [];
  }, [stopHeartbeat]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        // App came to foreground, reconnect if needed
        if (!connectionInfo.isConnected) {
          connect();
        }
      } else if (nextAppState === 'background') {
        // App went to background, disconnect to save resources
        disconnect();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Initial connection when hook mounts
    connect();

    return () => {
      subscription?.remove();
      disconnect();
    };
  }, []); // Empty dependency array for mount/unmount only

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected: connectionInfo.isConnected,
    connectionInfo,
    lastUpdate,
    subscriptions: Array.from(subscriptions),
    subscribeToCard,
    unsubscribeFromCard,
    reconnect: connect,
    disconnect,
  };
};