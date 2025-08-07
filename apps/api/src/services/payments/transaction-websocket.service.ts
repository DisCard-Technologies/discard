import { WebSocketServer, WebSocket } from 'ws';
import { Logger } from '../../utils/logger';
import { createClient } from '@supabase/supabase-js';
import { IncomingMessage } from 'http';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

interface AuthorizationStatusUpdate extends WebSocketMessage {
  type: 'authorization_status';
  data: {
    authorizationId: string;
    status: 'approved' | 'declined' | 'expired';
    cardContext: string;
  };
}

interface HoldStatusUpdate extends WebSocketMessage {
  type: 'hold_status';
  data: {
    holdId: string;
    status: 'active' | 'released' | 'expired' | 'partially_released';
    amount: number;
    remainingAmount: number;
    cardContext: string;
  };
}

interface RetryAttemptUpdate extends WebSocketMessage {
  type: 'retry_attempt';
  data: {
    authorizationId: string;
    attempt: number;
    maxAttempts: number;
    nextRetryAt: string;
    cardContext: string;
  };
}

interface FraudAlertUpdate extends WebSocketMessage {
  type: 'fraud_alert';
  data: {
    authorizationId: string;
    riskScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    action: 'approve' | 'decline' | 'review';
    cardContext: string;
  };
}

interface ClientConnection {
  ws: WebSocket;
  cardContext: string;
  userId?: string;
  connectionId: string;
  connectedAt: Date;
  lastHeartbeat: Date;
}

export class TransactionWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private logger = new Logger('TransactionWebSocketService');
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Configuration
  private readonly heartbeatInterval = parseInt(process.env.WEBSOCKET_HEARTBEAT_INTERVAL_MS || '30000');
  private readonly connectionTimeout = parseInt(process.env.WEBSOCKET_CONNECTION_TIMEOUT_MS || '5000');
  private readonly channel = process.env.WEBSOCKET_AUTHORIZATION_CHANNEL || 'payments_auth';

  /**
   * Initialize WebSocket server
   */
  init(server: any): void {
    this.wss = new WebSocketServer({ server });
    
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleConnection(ws, request);
    });

    // Setup heartbeat interval
    setInterval(() => {
      this.performHeartbeat();
    }, this.heartbeatInterval);

    // Setup connection cleanup
    setInterval(() => {
      this.cleanupStaleConnections();
    }, this.heartbeatInterval * 2);

    this.logger.info('Transaction WebSocket service initialized');
  }

  /**
   * Broadcast authorization status update
   */
  async broadcastAuthorizationStatus(authorizationId: string, status: 'approved' | 'declined' | 'expired', cardContext: string): Promise<void> {
    const message: AuthorizationStatusUpdate = {
      type: 'authorization_status',
      data: {
        authorizationId,
        status,
        cardContext
      },
      timestamp: new Date().toISOString()
    };

    await this.broadcastToCard(cardContext, message);
    
    this.logger.debug('Broadcasted authorization status update', {
      authorizationId,
      status,
      clientCount: this.getClientCountForCard(cardContext)
    });
  }

  /**
   * Broadcast hold status update
   */
  async broadcastHoldStatus(holdId: string, status: 'active' | 'released' | 'expired' | 'partially_released', amount: number, remainingAmount: number, cardContext: string): Promise<void> {
    const message: HoldStatusUpdate = {
      type: 'hold_status',
      data: {
        holdId,
        status,
        amount,
        remainingAmount,
        cardContext
      },
      timestamp: new Date().toISOString()
    };

    await this.broadcastToCard(cardContext, message);
    
    this.logger.debug('Broadcasted hold status update', {
      holdId,
      status,
      clientCount: this.getClientCountForCard(cardContext)
    });
  }

  /**
   * Broadcast retry attempt update
   */
  async broadcastRetryAttempt(authorizationId: string, attempt: number, maxAttempts: number, nextRetryAt: string, cardContext: string): Promise<void> {
    const message: RetryAttemptUpdate = {
      type: 'retry_attempt',
      data: {
        authorizationId,
        attempt,
        maxAttempts,
        nextRetryAt,
        cardContext
      },
      timestamp: new Date().toISOString()
    };

    await this.broadcastToCard(cardContext, message);
    
    this.logger.debug('Broadcasted retry attempt update', {
      authorizationId,
      attempt,
      clientCount: this.getClientCountForCard(cardContext)
    });
  }

  /**
   * Broadcast fraud alert
   */
  async broadcastFraudAlert(authorizationId: string, riskScore: number, riskLevel: 'low' | 'medium' | 'high' | 'critical', action: 'approve' | 'decline' | 'review', cardContext: string): Promise<void> {
    const message: FraudAlertUpdate = {
      type: 'fraud_alert',
      data: {
        authorizationId,
        riskScore,
        riskLevel,
        action,
        cardContext
      },
      timestamp: new Date().toISOString()
    };

    // Only broadcast high-risk alerts to avoid noise
    if (riskScore >= 60) {
      await this.broadcastToCard(cardContext, message);
      
      this.logger.info('Broadcasted fraud alert', {
        authorizationId,
        riskScore,
        riskLevel,
        clientCount: this.getClientCountForCard(cardContext)
      });
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    activeConnections: number;
    connectionsByCard: Record<string, number>;
  } {
    const totalConnections = this.clients.size;
    let activeConnections = 0;
    const connectionsByCard: Record<string, number> = {};

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        activeConnections++;
        const cardContext = client.cardContext;
        connectionsByCard[cardContext] = (connectionsByCard[cardContext] || 0) + 1;
      }
    }

    return {
      totalConnections,
      activeConnections,
      connectionsByCard
    };
  }

  /**
   * Private: Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const connectionId = crypto.randomUUID();
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const cardContext = url.searchParams.get('cardContext');
    const userId = url.searchParams.get('userId');

    if (!cardContext) {
      ws.close(1008, 'Card context is required');
      return;
    }

    const client: ClientConnection = {
      ws,
      cardContext,
      userId: userId || undefined,
      connectionId,
      connectedAt: new Date(),
      lastHeartbeat: new Date()
    };

    this.clients.set(connectionId, client);

    // Setup message handlers
    ws.on('message', (data: Buffer) => {
      this.handleMessage(connectionId, data);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnection(connectionId, code, reason.toString());
    });

    ws.on('error', (error: Error) => {
      this.logger.error('WebSocket error', { error, connectionId, cardContext });
      this.clients.delete(connectionId);
    });

    // Send connection confirmation
    this.sendMessage(ws, {
      type: 'connection_established',
      connectionId,
      timestamp: new Date().toISOString()
    });

    this.logger.info('New WebSocket connection established', {
      connectionId,
      cardContext,
      userId,
      totalConnections: this.clients.size
    });
  }

  /**
   * Private: Handle incoming WebSocket message
   */
  private handleMessage(connectionId: string, data: Buffer): void {
    try {
      const client = this.clients.get(connectionId);
      if (!client) return;

      const message = JSON.parse(data.toString()) as WebSocketMessage;
      client.lastHeartbeat = new Date();

      switch (message.type) {
        case 'ping':
          this.sendMessage(client.ws, {
            type: 'pong',
            timestamp: new Date().toISOString()
          });
          break;

        case 'subscribe_authorization':
          // Handle authorization subscription
          this.handleAuthorizationSubscription(client, message.data);
          break;

        case 'subscribe_holds':
          // Handle holds subscription
          this.handleHoldsSubscription(client, message.data);
          break;

        default:
          this.logger.warn('Unknown message type', { type: message.type, connectionId });
      }
    } catch (error) {
      this.logger.error('Failed to handle WebSocket message', { error, connectionId });
    }
  }

  /**
   * Private: Handle client disconnection
   */
  private handleDisconnection(connectionId: string, code: number, reason: string): void {
    const client = this.clients.get(connectionId);
    if (client) {
      this.logger.info('WebSocket connection closed', {
        connectionId,
        cardContext: client.cardContext,
        code,
        reason,
        duration: Date.now() - client.connectedAt.getTime()
      });
    }

    this.clients.delete(connectionId);
  }

  /**
   * Private: Handle authorization subscription
   */
  private async handleAuthorizationSubscription(
    client: ClientConnection, 
    subscriptionData: any
  ): Promise<void> {
    try {
      const { authorizationId } = subscriptionData;
      
      if (!authorizationId) {
        this.sendMessage(client.ws, {
          type: 'subscription_error',
          error: 'Authorization ID is required for subscription',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Validate authorization belongs to client's card context
      const { data: authorization } = await this.supabase
        .from('authorization_transactions')
        .select('card_context')
        .eq('authorization_id', authorizationId)
        .single();

      if (!authorization || authorization.card_context !== client.cardContext) {
        this.sendMessage(client.ws, {
          type: 'subscription_error',
          error: 'Authorization not found or access denied',
          timestamp: new Date().toISOString()
        });
        return;
      }

      this.sendMessage(client.ws, {
        type: 'subscription_confirmed',
        subscriptionType: 'authorization',
        authorizationId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle authorization subscription', { error, client });
    }
  }

  /**
   * Private: Handle holds subscription
   */
  private async handleHoldsSubscription(
    client: ClientConnection, 
    subscriptionData: any
  ): Promise<void> {
    try {
      // Client is subscribing to all hold updates for their card context
      this.sendMessage(client.ws, {
        type: 'subscription_confirmed',
        subscriptionType: 'holds',
        cardContext: client.cardContext,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle holds subscription', { error, client });
    }
  }

  /**
   * Private: Broadcast message to all clients for a specific card
   */
  private async broadcastToCard(cardContext: string, message: WebSocketMessage): Promise<void> {
    const cardClients = Array.from(this.clients.values())
      .filter(client => client.cardContext === cardContext && client.ws.readyState === WebSocket.OPEN);

    if (cardClients.length === 0) {
      return;
    }

    const promises = cardClients.map(client => 
      this.sendMessage(client.ws, message)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Private: Send message to specific WebSocket
   */
  private sendMessage(ws: WebSocket, message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (ws.readyState !== WebSocket.OPEN) {
        resolve();
        return;
      }

      ws.send(JSON.stringify(message), (error) => {
        if (error) {
          this.logger.error('Failed to send WebSocket message', { error, message });
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Private: Perform heartbeat check
   */
  private performHeartbeat(): void {
    const now = new Date();
    const timeout = this.connectionTimeout;

    for (const [connectionId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        // Send ping
        this.sendMessage(client.ws, {
          type: 'ping',
          timestamp: now.toISOString()
        }).catch(() => {
          // Ping failed, remove client
          this.clients.delete(connectionId);
        });
      } else {
        // Remove dead connection
        this.clients.delete(connectionId);
      }
    }
  }

  /**
   * Private: Clean up stale connections
   */
  private cleanupStaleConnections(): void {
    const now = new Date();
    const maxAge = this.heartbeatInterval * 3; // 3 missed heartbeats

    for (const [connectionId, client] of this.clients.entries()) {
      const age = now.getTime() - client.lastHeartbeat.getTime();
      
      if (age > maxAge || client.ws.readyState !== WebSocket.OPEN) {
        this.logger.debug('Cleaning up stale connection', {
          connectionId,
          age,
          readyState: client.ws.readyState
        });
        
        try {
          client.ws.close();
        } catch (error) {
          // Ignore close errors
        }
        
        this.clients.delete(connectionId);
      }
    }
  }

  /**
   * Private: Get client count for specific card
   */
  private getClientCountForCard(cardContext: string): number {
    return Array.from(this.clients.values())
      .filter(client => client.cardContext === cardContext && client.ws.readyState === WebSocket.OPEN)
      .length;
  }

  /**
   * Shutdown WebSocket service
   */
  shutdown(): void {
    if (this.wss) {
      // Close all client connections
      for (const client of this.clients.values()) {
        try {
          client.ws.close(1001, 'Server shutting down');
        } catch (error) {
          // Ignore close errors during shutdown
        }
      }
      
      this.clients.clear();
      
      // Close server
      this.wss.close(() => {
        this.logger.info('Transaction WebSocket service shut down');
      });
    }
  }
}