import { WebSocket, WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';

// Inline type definitions
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

interface SpendingAlertUpdate {
  type: 'spending_alert';
  cardContext: string;
  alertType: 'limit_threshold' | 'unusual_pattern' | 'velocity';
  threshold: number;
  currentAmount: number;
  message: string;
  timestamp: string;
}

interface NotificationUpdate {
  type: 'notification_status';
  notificationId: string;
  status: 'delivered' | 'read' | 'failed';
  timestamp: string;
}

type WebSocketMessage = TransactionFeedUpdate | SpendingAlertUpdate | NotificationUpdate;

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  cardContexts?: string[];
  lastHeartbeat?: number;
  isAuthenticated?: boolean;
}

interface WebSocketConnection {
  ws: AuthenticatedWebSocket;
  userId: string;
  cardContexts: string[];
  subscriptions: Set<string>;
}

class TransactionFeedWebSocketService {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, WebSocketConnection>();
  private supabase;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 60000; // 60 seconds

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!
    );
  }

  initialize(server: any): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/transactions/feed',
      verifyClient: this.verifyClient.bind(this),
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();
    
    console.log('Transaction Feed WebSocket Service initialized');
  }

  private async verifyClient({ req }: { req: IncomingMessage }): Promise<boolean> {
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        console.log('WebSocket connection rejected: No token provided');
        return false;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (!decoded.userId) {
        console.log('WebSocket connection rejected: Invalid token');
        return false;
      }

      // Store user info for use in connection handler
      (req as any).userId = decoded.userId;
      return true;
    } catch (error) {
      console.log('WebSocket connection rejected: Token verification failed', error);
      return false;
    }
  }

  private async handleConnection(ws: AuthenticatedWebSocket, req: IncomingMessage): Promise<void> {
    const userId = (req as any).userId;
    const connectionId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`New WebSocket connection: ${connectionId} for user: ${userId}`);

    try {
      // Get user's card contexts for privacy isolation
      const { data: cards, error } = await this.supabase
        .from('payment_cards')
        .select('card_context')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching user cards:', error);
        ws.close(1011, 'Failed to authenticate');
        return;
      }

      const cardContexts = cards.map(card => card.card_context);
      
      // Initialize WebSocket with user data
      ws.userId = userId;
      ws.cardContexts = cardContexts;
      ws.lastHeartbeat = Date.now();
      ws.isAuthenticated = true;

      // Store connection
      const connection: WebSocketConnection = {
        ws,
        userId,
        cardContexts,
        subscriptions: new Set(),
      };
      
      this.connections.set(connectionId, connection);

      // Set up message handlers
      ws.on('message', (data) => this.handleMessage(connectionId, data));
      ws.on('close', () => this.handleDisconnection(connectionId));
      ws.on('error', (error) => this.handleError(connectionId, error));

      // Send welcome message with available subscriptions
      this.sendMessage(ws, {
        type: 'connection_established',
        connectionId,
        availableCards: cardContexts.length,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('Error setting up WebSocket connection:', error);
      ws.close(1011, 'Connection setup failed');
    }
  }

  private handleMessage(connectionId: string, data: any): void {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) return;

      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(connection, message);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(connection, message);
          break;
        case 'heartbeat':
          this.handleHeartbeat(connection);
          break;
        case 'get_transaction_history':
          this.handleGetTransactionHistory(connection, message);
          break;
        default:
          console.log(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  private handleSubscribe(connection: WebSocketConnection, message: any): void {
    const { cardContext, subscriptionType = 'all' } = message;
    
    // Verify user has access to this card context
    if (!connection.cardContexts.includes(cardContext)) {
      this.sendMessage(connection.ws, {
        type: 'subscription_error',
        error: 'Access denied to card context',
        cardContext,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Add subscription
    const subscriptionKey = `${cardContext}:${subscriptionType}`;
    connection.subscriptions.add(subscriptionKey);

    this.sendMessage(connection.ws, {
      type: 'subscription_confirmed',
      cardContext,
      subscriptionType,
      timestamp: new Date().toISOString(),
    });

    console.log(`User ${connection.userId} subscribed to ${subscriptionKey}`);
  }

  private handleUnsubscribe(connection: WebSocketConnection, message: any): void {
    const { cardContext, subscriptionType = 'all' } = message;
    const subscriptionKey = `${cardContext}:${subscriptionType}`;
    
    connection.subscriptions.delete(subscriptionKey);
    
    this.sendMessage(connection.ws, {
      type: 'unsubscription_confirmed',
      cardContext,
      subscriptionType,
      timestamp: new Date().toISOString(),
    });

    console.log(`User ${connection.userId} unsubscribed from ${subscriptionKey}`);
  }

  private handleHeartbeat(connection: WebSocketConnection): void {
    connection.ws.lastHeartbeat = Date.now();
    
    this.sendMessage(connection.ws, {
      type: 'heartbeat_ack',
      timestamp: new Date().toISOString(),
    });
  }

  private async handleGetTransactionHistory(connection: WebSocketConnection, message: any): Promise<void> {
    try {
      const { cardContext, limit = 10, offset = 0 } = message;
      
      // Verify access to card context
      if (!connection.cardContexts.includes(cardContext)) {
        this.sendMessage(connection.ws, {
          type: 'transaction_history_error',
          error: 'Access denied to card context',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Fetch recent transactions for the card
      const { data: transactions, error } = await this.supabase
        .from('payment_transactions')
        .select(`
          transaction_id,
          merchant_name,
          amount,
          currency,
          status,
          created_at,
          transaction_categories(category_name, icon)
        `)
        .eq('card_context', cardContext)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error fetching transaction history:', error);
        this.sendMessage(connection.ws, {
          type: 'transaction_history_error',
          error: 'Failed to fetch transaction history',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      this.sendMessage(connection.ws, {
        type: 'transaction_history',
        cardContext,
        transactions: transactions || [],
        hasMore: transactions && transactions.length === limit,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error handling get transaction history:', error);
    }
  }

  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      console.log(`WebSocket disconnected: ${connectionId} for user: ${connection.userId}`);
      this.connections.delete(connectionId);
    }
  }

  private handleError(connectionId: string, error: Error): void {
    console.error(`WebSocket error for connection ${connectionId}:`, error);
    this.connections.delete(connectionId);
  }

  private sendMessage(ws: AuthenticatedWebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    }
  }

  // Public methods for broadcasting updates

  async broadcastTransactionUpdate(update: TransactionFeedUpdate): Promise<void> {
    const message = { ...update, timestamp: new Date().toISOString() };
    
    for (const [connectionId, connection] of this.connections) {
      // Check if user has access to this card context
      if (!connection.cardContexts.includes(update.cardContext)) {
        continue;
      }

      // Check if subscribed to transaction updates for this card
      const hasSubscription = 
        connection.subscriptions.has(`${update.cardContext}:all`) ||
        connection.subscriptions.has(`${update.cardContext}:transactions`);

      if (hasSubscription) {
        this.sendMessage(connection.ws, message);
      }
    }
  }

  async broadcastSpendingAlert(alert: SpendingAlertUpdate): Promise<void> {
    const message = { ...alert, timestamp: new Date().toISOString() };
    
    for (const [connectionId, connection] of this.connections) {
      // Check if user has access to this card context
      if (!connection.cardContexts.includes(alert.cardContext)) {
        continue;
      }

      // Check if subscribed to spending alerts for this card
      const hasSubscription = 
        connection.subscriptions.has(`${alert.cardContext}:all`) ||
        connection.subscriptions.has(`${alert.cardContext}:alerts`);

      if (hasSubscription) {
        this.sendMessage(connection.ws, message);
      }
    }
  }

  async broadcastNotificationUpdate(update: NotificationUpdate): Promise<void> {
    const message = { ...update, timestamp: new Date().toISOString() };
    
    // Broadcast to all authenticated connections
    for (const [connectionId, connection] of this.connections) {
      if (connection.ws.isAuthenticated) {
        this.sendMessage(connection.ws, message);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [connectionId, connection] of this.connections) {
        const lastHeartbeat = connection.ws.lastHeartbeat || 0;
        
        if (now - lastHeartbeat > this.CONNECTION_TIMEOUT) {
          console.log(`Connection ${connectionId} timed out`);
          connection.ws.close(1000, 'Connection timeout');
          this.connections.delete(connectionId);
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  getConnectionStats(): any {
    const stats = {
      totalConnections: this.connections.size,
      connectionsByUser: {} as Record<string, number>,
      totalSubscriptions: 0,
    };

    for (const connection of this.connections.values()) {
      stats.connectionsByUser[connection.userId] = (stats.connectionsByUser[connection.userId] || 0) + 1;
      stats.totalSubscriptions += connection.subscriptions.size;
    }

    return stats;
  }

  shutdown(): void {
    console.log('Shutting down Transaction Feed WebSocket Service...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all connections
    for (const connection of this.connections.values()) {
      connection.ws.close(1000, 'Server shutdown');
    }
    
    this.connections.clear();

    if (this.wss) {
      this.wss.close();
    }
    
    console.log('Transaction Feed WebSocket Service shutdown complete');
  }
}

export default TransactionFeedWebSocketService;