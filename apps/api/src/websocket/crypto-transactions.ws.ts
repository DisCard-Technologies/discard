import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../utils/logger';
import { TransactionWebSocketService } from '../services/crypto/transaction-websocket.service';
import { DatabaseService } from '../services/database.service';

export interface CryptoTransactionWebSocketServer {
  server: WebSocketServer;
  service: TransactionWebSocketService;
}

export function createCryptoTransactionWebSocketServer(
  port: number = 8081,
  databaseService: DatabaseService
): CryptoTransactionWebSocketServer {
  
  const service = new TransactionWebSocketService();
  
  const server = new WebSocketServer({
    port,
    path: '/ws/crypto/transactions',
    verifyClient: async (info) => {
      return await verifyWebSocketClient(info, databaseService);
    }
  });

  // Initialize the service with the server
  service.initialize(server);

  server.on('listening', () => {
    logger.info(`Crypto Transaction WebSocket server listening on port ${port}`);
  });

  server.on('error', (error) => {
    logger.error('WebSocket server error', { error: error.message });
  });

  return { server, service };
}

async function verifyWebSocketClient(
  info: { origin: string; secure: boolean; req: IncomingMessage },
  databaseService: DatabaseService
): Promise<boolean> {
  try {
    const { req } = info;
    const url = new URL(req.url || '', `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`);
    
    // Extract authentication token from query params or headers
    const token = url.searchParams.get('token') || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!token) {
      logger.warn('WebSocket connection rejected: No authentication token');
      return false;
    }

    // Extract cardId from query params
    const cardId = url.searchParams.get('cardId');
    if (!cardId) {
      logger.warn('WebSocket connection rejected: No cardId provided');
      return false;
    }

    // Verify token and card access (simplified verification)
    const isValid = await verifyTokenAndCardAccess(token, cardId, databaseService);
    
    if (!isValid) {
      logger.warn('WebSocket connection rejected: Invalid token or card access', { cardId });
      return false;
    }

    logger.info('WebSocket connection authorized', { cardId });
    return true;
    
  } catch (error) {
    logger.error('Error verifying WebSocket client', { error: error.message });
    return false;
  }
}

async function verifyTokenAndCardAccess(
  token: string,
  cardId: string,
  databaseService: DatabaseService
): Promise<boolean> {
  try {
    // This is a simplified verification - in production you would:
    // 1. Decode and verify JWT token
    // 2. Extract user ID from token
    // 3. Verify user has access to the specified card
    
    // For now, just check if the card exists
    const result = await databaseService.query(
      'SELECT card_id FROM cards WHERE card_id = $1',
      [cardId]
    );

    return result.rows.length > 0;
    
  } catch (error) {
    logger.error('Error verifying token and card access', { error: error.message, cardId });
    return false;
  }
}

export class CryptoTransactionWebSocketManager {
  private servers: Map<number, CryptoTransactionWebSocketServer> = new Map();
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  startServer(port: number = 8081): CryptoTransactionWebSocketServer {
    if (this.servers.has(port)) {
      throw new Error(`WebSocket server already running on port ${port}`);
    }

    const serverInfo = createCryptoTransactionWebSocketServer(port, this.databaseService);
    this.servers.set(port, serverInfo);

    return serverInfo;
  }

  getServer(port: number = 8081): CryptoTransactionWebSocketServer | undefined {
    return this.servers.get(port);
  }

  async stopServer(port: number = 8081): Promise<void> {
    const serverInfo = this.servers.get(port);
    if (!serverInfo) {
      return;
    }

    await serverInfo.service.shutdown();
    
    return new Promise((resolve) => {
      serverInfo.server.close(() => {
        logger.info(`WebSocket server stopped on port ${port}`);
        resolve();
      });
    });
  }

  async stopAllServers(): Promise<void> {
    const stopPromises: Promise<void>[] = [];
    
    for (const port of this.servers.keys()) {
      stopPromises.push(this.stopServer(port));
    }

    await Promise.all(stopPromises);
    this.servers.clear();
  }

  getServerStats(): Record<number, { total: number; byCard: Record<string, number> }> {
    const stats: Record<number, { total: number; byCard: Record<string, number> }> = {};
    
    for (const [port, serverInfo] of this.servers.entries()) {
      stats[port] = serverInfo.service.getConnectedClients();
    }

    return stats;
  }
}

// Health check endpoint for WebSocket server
export function createWebSocketHealthCheck(manager: CryptoTransactionWebSocketManager) {
  return (req: any, res: any) => {
    try {
      const stats = manager.getServerStats();
      const totalConnections = Object.values(stats).reduce((sum, stat) => sum + stat.total, 0);

      res.json({
        status: 'healthy',
        websocket: {
          totalConnections,
          serverPorts: Object.keys(stats).map(Number),
          detailed: stats
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  };
}