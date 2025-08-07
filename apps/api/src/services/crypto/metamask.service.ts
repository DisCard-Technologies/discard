import { MetaMaskSDK } from '@metamask/sdk';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../app';
import { 
  MetaMaskConnectionRequest,
  CryptoWalletError,
  CRYPTO_ERROR_CODES 
} from '@discard/shared/src/types/crypto';

interface MetaMaskConnection {
  connectionId: string;
  accounts: string[];
  chainId: string;
  isConnected: boolean;
  permissions: string[];
  sessionExpiry: Date;
}

interface MetaMaskTransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  nonce?: string;
}

interface MetaMaskSignRequest {
  message: string;
  address: string;
  method: 'personal_sign' | 'eth_signTypedData_v4';
}

export class MetaMaskService {
  private sdk: MetaMaskSDK | null = null;
  private provider: any = null;
  private activeConnections: Map<string, MetaMaskConnection> = new Map();
  private readonly APP_NAME: string;
  private readonly APP_URL: string;

  constructor() {
    this.APP_NAME = process.env.APP_NAME || 'DisCard';
    this.APP_URL = process.env.APP_URL || 'https://discard.app';
  }

  /**
   * Initialize MetaMask SDK
   */
  async initialize(): Promise<void> {
    try {
      if (this.sdk) {
        return; // Already initialized
      }

      this.sdk = new MetaMaskSDK({
        dappMetadata: {
          name: this.APP_NAME,
          url: this.APP_URL,
          iconUrl: `${this.APP_URL}/icon.png`
        },
        preferDesktop: true, // Prefer desktop extension over mobile app
        logging: {
          developerMode: process.env.NODE_ENV === 'development',
          sdk: process.env.NODE_ENV === 'development'
        },
        checkInstallationImmediately: false, // Don't check installation on init
        enableAnalytics: false, // Disable analytics for privacy
        storage: {
          enabled: false // Disable storage for server-side usage
        }
      });

      this.provider = this.sdk.getProvider();

      if (this.provider) {
        this.setupEventListeners();
        console.log('MetaMask SDK initialized successfully');
      } else {
        throw new Error('MetaMask provider not available');
      }

    } catch (error) {
      console.error('Failed to initialize MetaMask SDK:', error);
      throw new Error('MetaMask SDK initialization failed');
    }
  }

  /**
   * Set up MetaMask event listeners
   */
  private setupEventListeners(): void {
    if (!this.provider) {
      return;
    }

    // Account changed event
    this.provider.on('accountsChanged', (accounts: string[]) => {
      console.log('MetaMask accounts changed:', accounts);
      this.handleAccountsChanged(accounts);
    });

    // Chain changed event
    this.provider.on('chainChanged', (chainId: string) => {
      console.log('MetaMask chain changed:', chainId);
      this.handleChainChanged(chainId);
    });

    // Connection event
    this.provider.on('connect', (connectInfo: { chainId: string }) => {
      console.log('MetaMask connected:', connectInfo);
    });

    // Disconnect event
    this.provider.on('disconnect', (error: any) => {
      console.log('MetaMask disconnected:', error);
      this.handleDisconnect();
    });
  }

  /**
   * Check if MetaMask is available
   */
  async isMetaMaskAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      
      if (!this.provider) {
        return false;
      }

      // Check if MetaMask is installed and accessible
      const isUnlocked = await this.provider.request({
        method: 'eth_accounts'
      });

      return Array.isArray(isUnlocked);
    } catch (error) {
      console.error('Error checking MetaMask availability:', error);
      return false;
    }
  }

  /**
   * Request MetaMask connection
   */
  async requestConnection(
    userId: string,
    connectionRequest: MetaMaskConnectionRequest
  ): Promise<MetaMaskConnection> {
    try {
      await this.ensureInitialized();

      if (!this.provider) {
        throw new Error('MetaMask provider not available');
      }

      // Request account access
      const accounts = await this.provider.request({
        method: 'eth_requestAccounts'
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from MetaMask');
      }

      // Get current chain ID
      const chainId = await this.provider.request({
        method: 'eth_chainId'
      });

      // Request permissions if specified
      let grantedPermissions: string[] = [];
      if (connectionRequest.requestedPermissions && connectionRequest.requestedPermissions.length > 0) {
        try {
          const permissionResult = await this.provider.request({
            method: 'wallet_requestPermissions',
            params: [
              connectionRequest.requestedPermissions.reduce((acc, perm) => {
                acc[perm] = {};
                return acc;
              }, {} as any)
            ]
          });

          grantedPermissions = permissionResult ? 
            permissionResult.map((p: any) => Object.keys(p.caveats?.[0]?.value || {})).flat() :
            connectionRequest.requestedPermissions;
        } catch (permError) {
          console.warn('Permission request failed, using default permissions:', permError);
          grantedPermissions = ['eth_accounts']; // Default permission
        }
      } else {
        grantedPermissions = ['eth_accounts']; // Default permission
      }

      // Create connection record
      const connectionId = uuidv4();
      const sessionExpiry = new Date(Date.now() + (connectionRequest.sessionDuration || 3600) * 1000);

      const connection: MetaMaskConnection = {
        connectionId,
        accounts,
        chainId,
        isConnected: true,
        permissions: grantedPermissions,
        sessionExpiry
      };

      // Store connection
      this.activeConnections.set(connectionId, connection);

      // Persist to database
      await this.persistConnectionToDatabase(userId, connection);

      console.log('MetaMask connection established:', connectionId);

      return connection;

    } catch (error: any) {
      console.error('Failed to establish MetaMask connection:', error);
      throw {
        code: CRYPTO_ERROR_CODES.METAMASK_NOT_DETECTED,
        message: 'Failed to connect to MetaMask',
        details: { error: error.message }
      } as CryptoWalletError;
    }
  }

  /**
   * Disconnect MetaMask connection
   */
  async disconnectConnection(connectionId: string): Promise<void> {
    try {
      const connection = this.activeConnections.get(connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      // Remove from active connections
      this.activeConnections.delete(connectionId);

      // Update database
      await this.markConnectionAsDisconnected(connectionId);

      console.log('MetaMask connection disconnected:', connectionId);

    } catch (error) {
      console.error('Failed to disconnect MetaMask connection:', error);
      throw error;
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(address: string): Promise<string> {
    try {
      await this.ensureInitialized();

      if (!this.provider) {
        throw new Error('MetaMask provider not available');
      }

      const balance = await this.provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });

      // Convert from wei to ETH
      return ethers.formatEther(balance);

    } catch (error) {
      console.error('Failed to get MetaMask account balance:', error);
      throw error;
    }
  }

  /**
   * Send transaction through MetaMask
   */
  async sendTransaction(
    connectionId: string,
    transactionRequest: MetaMaskTransactionRequest
  ): Promise<string> {
    try {
      await this.ensureInitialized();

      const connection = this.activeConnections.get(connectionId);
      if (!connection || !connection.isConnected) {
        throw new Error('MetaMask connection not found or not connected');
      }

      if (!this.provider) {
        throw new Error('MetaMask provider not available');
      }

      // Validate transaction permissions
      if (!connection.permissions.includes('eth_sendTransaction')) {
        throw new Error('Insufficient permissions for transaction');
      }

      const txHash = await this.provider.request({
        method: 'eth_sendTransaction',
        params: [transactionRequest]
      });

      console.log('MetaMask transaction sent:', txHash);

      return txHash;

    } catch (error) {
      console.error('Failed to send MetaMask transaction:', error);
      throw error;
    }
  }

  /**
   * Sign message with MetaMask
   */
  async signMessage(
    connectionId: string,
    signRequest: MetaMaskSignRequest
  ): Promise<string> {
    try {
      await this.ensureInitialized();

      const connection = this.activeConnections.get(connectionId);
      if (!connection || !connection.isConnected) {
        throw new Error('MetaMask connection not found or not connected');
      }

      if (!this.provider) {
        throw new Error('MetaMask provider not available');
      }

      // Validate signing permissions
      if (!connection.permissions.includes('personal_sign') && 
          !connection.permissions.includes('eth_signTypedData_v4')) {
        throw new Error('Insufficient permissions for signing');
      }

      let signature: string;

      if (signRequest.method === 'personal_sign') {
        signature = await this.provider.request({
          method: 'personal_sign',
          params: [signRequest.message, signRequest.address]
        });
      } else {
        // Parse message as typed data
        const typedData = JSON.parse(signRequest.message);
        signature = await this.provider.request({
          method: 'eth_signTypedData_v4',
          params: [signRequest.address, JSON.stringify(typedData)]
        });
      }

      console.log('MetaMask message signed successfully');

      return signature;

    } catch (error) {
      console.error('Failed to sign message with MetaMask:', error);
      throw error;
    }
  }

  /**
   * Get active connections for a user
   */
  async getActiveConnections(userId: string): Promise<MetaMaskConnection[]> {
    try {
      const { data: connections, error } = await supabase
        .from('wallet_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('connection_metadata->metamask_connection_id', 'is', null);

      if (error) {
        console.error('Database error fetching MetaMask connections:', error);
        return [];
      }

      return connections.map(session => ({
        connectionId: session.connection_metadata?.metamask_connection_id,
        accounts: session.connection_metadata?.accounts || [],
        chainId: session.connection_metadata?.chain_id || '0x1',
        isConnected: session.is_active,
        permissions: session.permissions || [],
        sessionExpiry: new Date(session.expires_at)
      }));

    } catch (error) {
      console.error('Failed to get active MetaMask connections:', error);
      return [];
    }
  }

  /**
   * Switch Ethereum chain in MetaMask
   */
  async switchChain(connectionId: string, chainId: string): Promise<void> {
    try {
      await this.ensureInitialized();

      const connection = this.activeConnections.get(connectionId);
      if (!connection || !connection.isConnected) {
        throw new Error('MetaMask connection not found or not connected');
      }

      if (!this.provider) {
        throw new Error('MetaMask provider not available');
      }

      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId }]
      });

      // Update connection chain ID
      connection.chainId = chainId;
      this.activeConnections.set(connectionId, connection);

      console.log('MetaMask chain switched to:', chainId);

    } catch (error) {
      console.error('Failed to switch MetaMask chain:', error);
      throw error;
    }
  }

  /**
   * Add Ethereum chain to MetaMask
   */
  async addChain(connectionId: string, chainConfig: any): Promise<void> {
    try {
      await this.ensureInitialized();

      const connection = this.activeConnections.get(connectionId);
      if (!connection || !connection.isConnected) {
        throw new Error('MetaMask connection not found or not connected');
      }

      if (!this.provider) {
        throw new Error('MetaMask provider not available');
      }

      await this.provider.request({
        method: 'wallet_addEthereumChain',
        params: [chainConfig]
      });

      console.log('MetaMask chain added:', chainConfig.chainId);

    } catch (error) {
      console.error('Failed to add MetaMask chain:', error);
      throw error;
    }
  }

  /**
   * Handle accounts changed event
   */
  private async handleAccountsChanged(accounts: string[]): Promise<void> {
    try {
      // Update all active connections with new accounts
      for (const [connectionId, connection] of this.activeConnections.entries()) {
        connection.accounts = accounts;
        this.activeConnections.set(connectionId, connection);

        // Update database
        await this.updateConnectionInDatabase(connectionId, { accounts });
      }

      console.log('MetaMask accounts updated across all connections');

    } catch (error) {
      console.error('Failed to handle accounts changed:', error);
    }
  }

  /**
   * Handle chain changed event
   */
  private async handleChainChanged(chainId: string): Promise<void> {
    try {
      // Update all active connections with new chain ID
      for (const [connectionId, connection] of this.activeConnections.entries()) {
        connection.chainId = chainId;
        this.activeConnections.set(connectionId, connection);

        // Update database
        await this.updateConnectionInDatabase(connectionId, { chainId });
      }

      console.log('MetaMask chain updated across all connections:', chainId);

    } catch (error) {
      console.error('Failed to handle chain changed:', error);
    }
  }

  /**
   * Handle disconnect event
   */
  private async handleDisconnect(): Promise<void> {
    try {
      // Mark all connections as disconnected
      for (const [connectionId, connection] of this.activeConnections.entries()) {
        connection.isConnected = false;
        await this.markConnectionAsDisconnected(connectionId);
      }

      // Clear active connections
      this.activeConnections.clear();

      console.log('All MetaMask connections disconnected');

    } catch (error) {
      console.error('Failed to handle disconnect:', error);
    }
  }

  /**
   * Persist connection to database
   */
  private async persistConnectionToDatabase(userId: string, connection: MetaMaskConnection): Promise<void> {
    try {
      const { error } = await supabase
        .from('wallet_sessions')
        .insert({
          session_id: connection.connectionId,
          wallet_id: connection.connectionId, // Use connection ID as wallet ID for MetaMask
          user_id: userId,
          session_context_hash: 'metamask_' + connection.connectionId,
          is_active: true,
          expires_at: connection.sessionExpiry.toISOString(),
          permissions: connection.permissions,
          connection_metadata: {
            metamask_connection_id: connection.connectionId,
            accounts: connection.accounts,
            chain_id: connection.chainId,
            connection_type: 'metamask'
          },
          last_activity: new Date().toISOString(),
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Failed to persist MetaMask connection to database:', error);
      }

    } catch (error) {
      console.error('Database error persisting MetaMask connection:', error);
    }
  }

  /**
   * Update connection in database
   */
  private async updateConnectionInDatabase(connectionId: string, updates: any): Promise<void> {
    try {
      const { error } = await supabase
        .from('wallet_sessions')
        .update({
          connection_metadata: {
            metamask_connection_id: connectionId,
            connection_type: 'metamask',
            ...updates
          },
          last_activity: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('connection_metadata->metamask_connection_id', connectionId);

      if (error) {
        console.error('Failed to update MetaMask connection in database:', error);
      }

    } catch (error) {
      console.error('Database error updating MetaMask connection:', error);
    }
  }

  /**
   * Mark connection as disconnected in database
   */
  private async markConnectionAsDisconnected(connectionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('wallet_sessions')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('connection_metadata->metamask_connection_id', connectionId);

      if (error) {
        console.error('Failed to mark MetaMask connection as disconnected:', error);
      }

    } catch (error) {
      console.error('Database error marking MetaMask connection as disconnected:', error);
    }
  }

  /**
   * Cleanup expired connections
   */
  async cleanupExpiredConnections(): Promise<void> {
    try {
      const currentTime = Date.now();

      // Clean up expired connections from memory
      for (const [connectionId, connection] of this.activeConnections.entries()) {
        if (connection.sessionExpiry.getTime() < currentTime) {
          this.activeConnections.delete(connectionId);
          await this.markConnectionAsDisconnected(connectionId);
        }
      }

      console.log('MetaMask expired connections cleaned up');

    } catch (error) {
      console.error('Failed to cleanup expired MetaMask connections:', error);
    }
  }

  /**
   * Ensure SDK is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.sdk || !this.provider) {
      await this.initialize();
    }
  }

  /**
   * Get MetaMask provider (for testing purposes)
   */
  getProvider(): any {
    return this.provider;
  }

  /**
   * Check if MetaMask is configured
   */
  isConfigured(): boolean {
    return !!this.APP_NAME && !!this.APP_URL;
  }
}

export const metamaskService = new MetaMaskService();