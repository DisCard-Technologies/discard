import { WebSocket, WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { CryptoTransactionProcessing } from './transaction.service';

export interface WebSocketClient {
  id: string;
  cardId: string;
  socket: WebSocket;
  lastPing: Date;
}

export interface TransactionUpdate {
  type: 'TRANSACTION_STATUS_UPDATE';
  payload: {
    transactionId: string;
    processing: CryptoTransactionProcessing;
    timestamp: Date;
  };
}

export interface NetworkCongestionUpdate {
  type: 'NETWORK_CONGESTION_UPDATE';
  payload: {
    networkType: string;
    congestionLevel: 'low' | 'medium' | 'high';
    feeEstimates: {
      slow: number;
      standard: number;
      fast: number;
    };
    timestamp: Date;
  };
}

export class TransactionWebSocketService {
  private clients: Map<string, WebSocketClient> = new Map();
  private cardSubscriptions: Map<string, Set<string>> = new Map(); // cardId -> Set of client IDs
  private server: WebSocketServer | null = null;

  constructor() {
    this.startHeartbeat();
  }

  initialize(server: WebSocketServer): void {
    this.server = server;
    
    server.on('connection', (socket: WebSocket, request) => {
      this.handleConnection(socket, request);
    });

    logger.info('Transaction WebSocket service initialized');
  }

  private handleConnection(socket: WebSocket, request: any): void {
    const clientId = uuidv4();
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const cardId = url.searchParams.get('cardId');

    if (!cardId) {
      socket.close(4000, 'Missing cardId parameter');
      return;
    }

    const client: WebSocketClient = {
      id: clientId,
      cardId,
      socket,
      lastPing: new Date()
    };

    this.clients.set(clientId, client);
    
    // Subscribe to card updates
    if (!this.cardSubscriptions.has(cardId)) {
      this.cardSubscriptions.set(cardId, new Set());
    }
    this.cardSubscriptions.get(cardId)!.add(clientId);

    // Set up message handlers
    socket.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data);
    });

    socket.on('close', () => {
      this.handleDisconnection(clientId);
    });

    socket.on('error', (error) => {
      logger.error('WebSocket client error', { clientId, cardId, error: error.message });
      this.handleDisconnection(clientId);
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'CONNECTION_ESTABLISHED',
      payload: {
        clientId,
        cardId,
        timestamp: new Date()
      }
    });

    logger.info('Transaction WebSocket client connected', { clientId, cardId });
  }

  private handleMessage(clientId: string, data: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'PING':
          client.lastPing = new Date();
          this.sendToClient(clientId, {
            type: 'PONG',
            payload: { timestamp: new Date() }
          });
          break;

        case 'SUBSCRIBE_TRANSACTION':
          // Client can subscribe to specific transaction updates
          // This is handled automatically based on card context
          break;

        default:
          logger.warn('Unknown WebSocket message type', { clientId, type: message.type });
      }
    } catch (error) {
      logger.error('Error parsing WebSocket message', { clientId, error: error.message });
    }
  }

  private handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // Remove from card subscriptions
    const cardSubscriptions = this.cardSubscriptions.get(client.cardId);
    if (cardSubscriptions) {
      cardSubscriptions.delete(clientId);
      if (cardSubscriptions.size === 0) {
        this.cardSubscriptions.delete(client.cardId);
      }
    }

    // Remove client
    this.clients.delete(clientId);

    logger.info('Transaction WebSocket client disconnected', { 
      clientId, 
      cardId: client.cardId 
    });
  }

  async broadcastTransactionUpdate(cardId: string, processing: CryptoTransactionProcessing): Promise<void> {
    const update: TransactionUpdate = {
      type: 'TRANSACTION_STATUS_UPDATE',
      payload: {
        transactionId: processing.transactionId,
        processing,
        timestamp: new Date()
      }
    };

    await this.broadcastToCard(cardId, update);
  }

  async broadcastNetworkCongestionUpdate(
    networkType: string,
    congestionLevel: 'low' | 'medium' | 'high',
    feeEstimates: { slow: number; standard: number; fast: number }
  ): Promise<void> {
    const update: NetworkCongestionUpdate = {
      type: 'NETWORK_CONGESTION_UPDATE',
      payload: {
        networkType,
        congestionLevel,
        feeEstimates,
        timestamp: new Date()
      }
    };

    // Broadcast to all clients
    const message = JSON.stringify(update);
    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        try {
          client.socket.send(message);
        } catch (error) {
          logger.error('Error broadcasting network congestion update', {
            clientId: client.id,
            error: error.message
          });
        }
      }
    }
  }

  private async broadcastToCard(cardId: string, message: any): Promise<void> {
    const clientIds = this.cardSubscriptions.get(cardId);
    if (!clientIds || clientIds.size === 0) {
      return;
    }

    const messageString = JSON.stringify(message);
    const promises: Promise<void>[] = [];

    for (const clientId of clientIds) {
      promises.push(this.sendToClient(clientId, message, messageString));
    }

    await Promise.allSettled(promises);
  }

  private async sendToClient(clientId: string, message: any, messageString?: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const payload = messageString || JSON.stringify(message);
      client.socket.send(payload);
    } catch (error) {
      logger.error('Error sending WebSocket message', {
        clientId,
        cardId: client.cardId,
        error: error.message
      });
      
      // Remove dead connection
      this.handleDisconnection(clientId);
    }
  }

  private startHeartbeat(): void {
    setInterval(() => {
      const now = new Date();
      const deadClients: string[] = [];

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceLastPing = now.getTime() - client.lastPing.getTime();
        
        if (timeSinceLastPing > 60000) { // 60 seconds timeout
          deadClients.push(clientId);
        } else if (client.socket.readyState === WebSocket.OPEN) {
          // Send ping
          try {
            client.socket.ping();
          } catch (error) {
            deadClients.push(clientId);
          }
        }
      }

      // Clean up dead connections
      for (const clientId of deadClients) {
        this.handleDisconnection(clientId);
      }
    }, 30000); // Check every 30 seconds
  }

  getConnectedClients(): { total: number; byCard: Record<string, number> } {
    const byCard: Record<string, number> = {};
    
    for (const [cardId, clientIds] of this.cardSubscriptions.entries()) {
      byCard[cardId] = clientIds.size;
    }

    return {
      total: this.clients.size,
      byCard
    };
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Transaction WebSocket service');

    // Close all client connections
    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.close(1001, 'Server shutdown');
      }
    }

    // Clear all data structures
    this.clients.clear();
    this.cardSubscriptions.clear();

    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}