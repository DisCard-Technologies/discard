import { SignClient } from '@walletconnect/sign-client';
import { SessionTypes, ProposalTypes } from '@walletconnect/types';
import { getSdkError } from '@walletconnect/utils';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../app';
import { 
  WalletConnectSessionRequest,
  CryptoWalletError,
  CRYPTO_ERROR_CODES 
} from '@discard/shared/src/types/crypto';

interface WalletConnectSession {
  sessionId: string;
  topic: string;
  walletAddress: string;
  walletName?: string;
  expiryTimestamp: number;
  permissions: string[];
  chainIds: string[];
  methods: string[];
}

interface WalletConnectProposal {
  id: number;
  params: ProposalTypes.Struct;
  expiryTimestamp: number;
}

export class WalletConnectService {
  private signClient: InstanceType<typeof SignClient> | null = null;
  private activeSessions: Map<string, WalletConnectSession> = new Map();
  private pendingProposals: Map<string, WalletConnectProposal> = new Map();
  private readonly PROJECT_ID: string;
  private readonly RELAY_URL: string;
  
  // Supported blockchain namespaces
  private readonly SUPPORTED_NAMESPACES = {
    eip155: {
      methods: [
        'eth_sendTransaction',
        'eth_signTransaction',
        'eth_sign',
        'personal_sign',
        'eth_signTypedData',
        'eth_signTypedData_v4',
        'wallet_switchEthereumChain',
        'wallet_addEthereumChain'
      ],
      chains: [
        'eip155:1',    // Ethereum Mainnet
        'eip155:137',  // Polygon
        'eip155:56',   // BSC
        'eip155:42161' // Arbitrum
      ],
      events: ['accountsChanged', 'chainChanged']
    }
  };

  constructor() {
    this.PROJECT_ID = process.env.WALLETCONNECT_PROJECT_ID || '';
    this.RELAY_URL = process.env.WALLETCONNECT_RELAY_URL || 'wss://relay.walletconnect.com';
    
    if (!this.PROJECT_ID) {
      console.warn('WalletConnect PROJECT_ID not configured. WalletConnect functionality will be limited.');
    }
  }

  /**
   * Initialize WalletConnect SignClient
   */
  async initialize(): Promise<void> {
    try {
      if (this.signClient) {
        return; // Already initialized
      }

      this.signClient = await SignClient.init({
        projectId: this.PROJECT_ID,
        relayUrl: this.RELAY_URL,
        metadata: {
          name: 'DisCard',
          description: 'Privacy-focused digital payment cards with cryptocurrency integration',
          url: process.env.APP_URL || 'https://discard.app',
          icons: ['https://discard.app/icon.png']
        }
      });

      // Set up event listeners
      this.setupEventListeners();
      
      // Restore existing sessions
      await this.restoreExistingSessions();

      console.log('WalletConnect SignClient initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WalletConnect SignClient:', error);
      throw new Error('WalletConnect initialization failed');
    }
  }

  /**
   * Set up WalletConnect event listeners
   */
  private setupEventListeners(): void {
    if (!this.signClient) {
      throw new Error('SignClient not initialized');
    }

    // Session proposal event
    this.signClient.on('session_proposal', async (args: any) => {
      console.log('Received session proposal:', args.id);
      
      // Store proposal for user approval
      this.pendingProposals.set(args.id.toString(), {
        id: args.id,
        params: args.params,
        expiryTimestamp: Date.now() + (5 * 60 * 1000) // 5 minutes
      });
    });

    // Session established event - TODO: Fix event name for WalletConnect v2
    // this.signClient.on('session_settlement', async (args: any) => {
    //   console.log('Session established:', args.topic);
    //   await this.handleSessionEstablished(args);
    // });

    // Session update event
    this.signClient.on('session_update', async ({ topic, params }: { topic: string; params: Record<string, any> }) => {
      console.log('Session updated:', topic);
      await this.handleSessionUpdate(topic, params);
    });

    // Session delete event
    this.signClient.on('session_delete', async ({ topic }: { topic: string }) => {
      console.log('Session deleted:', topic);
      await this.handleSessionDelete(topic);
    });

    // Session expire event
    this.signClient.on('session_expire', async ({ topic }: { topic: string }) => {
      console.log('Session expired:', topic);
      await this.handleSessionExpire(topic);
    });

    // Session request event
    this.signClient.on('session_request', async (requestEvent: { id: number; topic: string; params: any }) => {
      console.log('Session request received:', requestEvent.id);
      // Handle session requests (transaction signing, etc.)
      await this.handleSessionRequest(requestEvent);
    });
  }

  /**
   * Create a new WalletConnect session proposal
   */
  async createSessionProposal(
    userId: string,
    sessionRequest: WalletConnectSessionRequest
  ): Promise<{ uri: string; proposalId: string }> {
    try {
      await this.ensureInitialized();

      const requiredNamespaces = {
        eip155: {
          methods: sessionRequest.requiredNamespaces?.includes('eip155') 
            ? this.SUPPORTED_NAMESPACES.eip155.methods 
            : ['eth_sendTransaction', 'personal_sign'],
          chains: this.SUPPORTED_NAMESPACES.eip155.chains,
          events: this.SUPPORTED_NAMESPACES.eip155.events
        }
      };

      const { uri, approval } = await this.signClient!.connect({
        requiredNamespaces,
        optionalNamespaces: {},
        sessionProperties: {
          userId: userId,
          appName: 'DisCard',
          sessionDuration: (sessionRequest.sessionDuration || 3600).toString()
        }
      });

      if (!uri) {
        throw new Error('Failed to generate WalletConnect URI');
      }

      // Generate proposal ID for tracking
      const proposalId = uuidv4();
      
      // Store the approval promise for later resolution
      this.storePendingApproval(proposalId, approval, userId);

      console.log('WalletConnect session proposal created:', proposalId);

      return {
        uri,
        proposalId
      };

    } catch (error: any) {
      console.error('Failed to create WalletConnect session proposal:', error);
      throw {
        code: CRYPTO_ERROR_CODES.WALLETCONNECT_SESSION_FAILED,
        message: 'Failed to create WalletConnect session proposal',
        details: { error: error.message }
      } as CryptoWalletError;
    }
  }

  /**
   * Approve a session proposal
   */
  async approveSessionProposal(
    proposalId: string,
    userId: string,
    accounts: string[]
  ): Promise<WalletConnectSession> {
    try {
      await this.ensureInitialized();

      const proposal = this.pendingProposals.get(proposalId);
      if (!proposal) {
        throw new Error('Proposal not found or expired');
      }

      // Check if proposal has expired
      if (Date.now() > proposal.expiryTimestamp) {
        this.pendingProposals.delete(proposalId);
        throw new Error('Proposal has expired');
      }

      const session = await this.signClient!.approve({
        id: proposal.id,
        namespaces: {
          eip155: {
            accounts: accounts.map(account => `eip155:1:${account}`), // Ethereum mainnet accounts
            methods: this.SUPPORTED_NAMESPACES.eip155.methods,
            events: this.SUPPORTED_NAMESPACES.eip155.events
          }
        }
      });

      // Create session record
      const walletConnectSession: WalletConnectSession = {
        sessionId: uuidv4(),
        topic: session.topic,
        walletAddress: accounts[0], // Primary account
        walletName: proposal.params?.proposer?.metadata?.name,
        expiryTimestamp: Date.now() + (24 * 60 * 60 * 1000), // 24 hours default
        permissions: this.SUPPORTED_NAMESPACES.eip155.methods,
        chainIds: this.SUPPORTED_NAMESPACES.eip155.chains,
        methods: this.SUPPORTED_NAMESPACES.eip155.methods
      };

      // Store session
      this.activeSessions.set(session.topic, walletConnectSession);

      // Persist to database
      await this.persistSessionToDatabase(userId, walletConnectSession);

      // Clean up proposal
      this.pendingProposals.delete(proposalId);

      console.log('WalletConnect session approved:', walletConnectSession.sessionId);

      return walletConnectSession;

    } catch (error: any) {
      console.error('Failed to approve WalletConnect session:', error);
      throw {
        code: CRYPTO_ERROR_CODES.WALLETCONNECT_SESSION_FAILED,
        message: 'Failed to approve WalletConnect session',
        details: { error: error.message }
      } as CryptoWalletError;
    }
  }

  /**
   * Reject a session proposal
   */
  async rejectSessionProposal(proposalId: string, reason?: string): Promise<void> {
    try {
      await this.ensureInitialized();

      const proposal = this.pendingProposals.get(proposalId);
      if (!proposal) {
        throw new Error('Proposal not found');
      }

      await this.signClient!.reject({
        id: proposal.id,
        reason: getSdkError('USER_REJECTED')
      });

      this.pendingProposals.delete(proposalId);

      console.log('WalletConnect session proposal rejected:', proposalId);

    } catch (error) {
      console.error('Failed to reject WalletConnect session proposal:', error);
      throw error;
    }
  }

  /**
   * Disconnect a WalletConnect session
   */
  async disconnectSession(topic: string, reason?: string): Promise<void> {
    try {
      await this.ensureInitialized();

      await this.signClient!.disconnect({
        topic,
        reason: getSdkError('USER_DISCONNECTED')
      });

      // Remove from active sessions
      this.activeSessions.delete(topic);

      // Update database
      await this.markSessionAsDisconnected(topic);

      console.log('WalletConnect session disconnected:', topic);

    } catch (error) {
      console.error('Failed to disconnect WalletConnect session:', error);
      throw error;
    }
  }

  /**
   * Get active WalletConnect sessions for a user
   */
  async getActiveSessions(userId: string): Promise<WalletConnectSession[]> {
    try {
      const { data: sessions, error } = await supabase
        .from('wallet_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('connection_metadata->walletconnect_topic', 'is', null);

      if (error) {
        console.error('Database error fetching WalletConnect sessions:', error);
        return [];
      }

      return sessions.map(session => ({
        sessionId: session.session_id,
        topic: session.connection_metadata?.walletconnect_topic,
        walletAddress: session.connection_metadata?.wallet_address,
        walletName: session.connection_metadata?.wallet_name,
        expiryTimestamp: new Date(session.expires_at).getTime(),
        permissions: session.permissions || [],
        chainIds: session.connection_metadata?.chain_ids || [],
        methods: session.connection_metadata?.methods || []
      }));

    } catch (error) {
      console.error('Failed to get active WalletConnect sessions:', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const currentTime = Date.now();

      // Clean up expired proposals
      for (const [proposalId, proposal] of this.pendingProposals.entries()) {
        if (currentTime > proposal.expiryTimestamp) {
          this.pendingProposals.delete(proposalId);
        }
      }

      // Clean up expired sessions
      for (const [topic, session] of this.activeSessions.entries()) {
        if (currentTime > session.expiryTimestamp * 1000) {
          await this.handleSessionExpire(topic);
        }
      }

      console.log('WalletConnect expired sessions cleaned up');

    } catch (error) {
      console.error('Failed to cleanup expired WalletConnect sessions:', error);
    }
  }

  /**
   * Handle session established event
   */
  private async handleSessionEstablished(session: SessionTypes.Struct): Promise<void> {
    try {
      const accounts = Object.values(session.namespaces)
        .flatMap(namespace => namespace.accounts)
        .map(account => account.split(':')[2]); // Extract address from account string

      const walletConnectSession: WalletConnectSession = {
        sessionId: uuidv4(),
        topic: session.topic,
        walletAddress: accounts[0],
        walletName: session.peer.metadata?.name,
        expiryTimestamp: session.expiry,
        permissions: Object.values(session.namespaces).flatMap(ns => ns.methods),
        chainIds: Object.values(session.namespaces).flatMap(ns => ns.chains || []),
        methods: Object.values(session.namespaces).flatMap(ns => ns.methods)
      };

      this.activeSessions.set(session.topic, walletConnectSession);

      console.log('WalletConnect session established and stored:', walletConnectSession.sessionId);

    } catch (error) {
      console.error('Failed to handle session established:', error);
    }
  }

  /**
   * Handle session update event
   */
  private async handleSessionUpdate(topic: string, params: any): Promise<void> {
    try {
      const session = this.activeSessions.get(topic);
      if (session) {
        // Update session with new parameters
        if (params.namespaces) {
          session.permissions = Object.values(params.namespaces).flatMap((ns: any) => ns.methods);
          session.chainIds = Object.values(params.namespaces).flatMap((ns: any) => ns.chains || []);
        }

        this.activeSessions.set(topic, session);

        // Update database
        await this.updateSessionInDatabase(topic, session);
      }

      console.log('WalletConnect session updated:', topic);

    } catch (error) {
      console.error('Failed to handle session update:', error);
    }
  }

  /**
   * Handle session delete event
   */
  private async handleSessionDelete(topic: string): Promise<void> {
    try {
      this.activeSessions.delete(topic);
      await this.markSessionAsDisconnected(topic);

      console.log('WalletConnect session deleted:', topic);

    } catch (error) {
      console.error('Failed to handle session delete:', error);
    }
  }

  /**
   * Handle session expire event
   */
  private async handleSessionExpire(topic: string): Promise<void> {
    try {
      this.activeSessions.delete(topic);
      await this.markSessionAsExpired(topic);

      console.log('WalletConnect session expired:', topic);

    } catch (error) {
      console.error('Failed to handle session expire:', error);
    }
  }

  /**
   * Handle session request event
   */
  private async handleSessionRequest(requestEvent: any): Promise<void> {
    try {
      console.log('Handling WalletConnect session request:', requestEvent.id);
      
      // This would typically involve user approval for transaction signing
      // For now, we'll log the request and could implement approval flow later
      
      // Example: Auto-reject for safety (in production, this should require user approval)
      await this.signClient!.respond({
        topic: requestEvent.topic,
        response: {
          id: requestEvent.id,
          jsonrpc: '2.0',
          error: getSdkError('USER_REJECTED_METHODS')
        }
      });

    } catch (error) {
      console.error('Failed to handle session request:', error);
    }
  }

  /**
   * Store pending approval for session proposal
   */
  private storePendingApproval(proposalId: string, approval: Promise<SessionTypes.Struct>, userId: string): void {
    // Handle the approval promise
    approval
      .then((session) => {
        console.log('WalletConnect session approved automatically:', session.topic);
      })
      .catch((error) => {
        console.error('WalletConnect session approval failed:', error);
      });
  }

  /**
   * Persist session to database
   */
  private async persistSessionToDatabase(userId: string, session: WalletConnectSession): Promise<void> {
    try {
      const { error } = await supabase
        .from('wallet_sessions')
        .insert({
          session_id: session.sessionId,
          wallet_id: session.sessionId, // Use session ID as wallet ID for WalletConnect
          user_id: userId,
          session_context_hash: 'walletconnect_' + session.topic,
          is_active: true,
          expires_at: new Date(session.expiryTimestamp * 1000).toISOString(),
          permissions: session.permissions,
          connection_metadata: {
            walletconnect_topic: session.topic,
            wallet_address: session.walletAddress,
            wallet_name: session.walletName,
            chain_ids: session.chainIds,
            methods: session.methods,
            connection_type: 'walletconnect'
          },
          last_activity: new Date().toISOString(),
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Failed to persist WalletConnect session to database:', error);
      }

    } catch (error) {
      console.error('Database error persisting WalletConnect session:', error);
    }
  }

  /**
   * Update session in database
   */
  private async updateSessionInDatabase(topic: string, session: WalletConnectSession): Promise<void> {
    try {
      const { error } = await supabase
        .from('wallet_sessions')
        .update({
          permissions: session.permissions,
          connection_metadata: {
            walletconnect_topic: session.topic,
            wallet_address: session.walletAddress,
            wallet_name: session.walletName,
            chain_ids: session.chainIds,
            methods: session.methods,
            connection_type: 'walletconnect'
          },
          last_activity: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('connection_metadata->walletconnect_topic', topic);

      if (error) {
        console.error('Failed to update WalletConnect session in database:', error);
      }

    } catch (error) {
      console.error('Database error updating WalletConnect session:', error);
    }
  }

  /**
   * Mark session as disconnected in database
   */
  private async markSessionAsDisconnected(topic: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('wallet_sessions')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('connection_metadata->walletconnect_topic', topic);

      if (error) {
        console.error('Failed to mark WalletConnect session as disconnected:', error);
      }

    } catch (error) {
      console.error('Database error marking WalletConnect session as disconnected:', error);
    }
  }

  /**
   * Mark session as expired in database
   */
  private async markSessionAsExpired(topic: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('wallet_sessions')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('connection_metadata->walletconnect_topic', topic)
        .lt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Failed to mark WalletConnect session as expired:', error);
      }

    } catch (error) {
      console.error('Database error marking WalletConnect session as expired:', error);
    }
  }

  /**
   * Restore existing sessions from database
   */
  private async restoreExistingSessions(): Promise<void> {
    try {
      if (!this.signClient) {
        return;
      }

      const activeSessions = this.signClient.session.getAll();
      
      for (const session of activeSessions) {
        if (session.expiry * 1000 > Date.now()) {
          const accounts = Object.values(session.namespaces)
            .flatMap((namespace: any) => namespace.accounts)
            .map((account: string) => account.split(':')[2]);

          const walletConnectSession: WalletConnectSession = {
            sessionId: uuidv4(),
            topic: session.topic,
            walletAddress: accounts[0],
            walletName: session.peer.metadata?.name,
            expiryTimestamp: session.expiry,
            permissions: Object.values(session.namespaces).flatMap((ns: any) => ns.methods),
            chainIds: Object.values(session.namespaces).flatMap((ns: any) => ns.chains || []),
            methods: Object.values(session.namespaces).flatMap((ns: any) => ns.methods)
          };

          this.activeSessions.set(session.topic, walletConnectSession);
        }
      }

      console.log(`Restored ${this.activeSessions.size} active WalletConnect sessions`);

    } catch (error) {
      console.error('Failed to restore existing WalletConnect sessions:', error);
    }
  }

  /**
   * Ensure SignClient is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.signClient) {
      await this.initialize();
    }
  }

  /**
   * Get SignClient instance (for testing purposes)
   */
  getSignClient(): any | null {
    return this.signClient;
  }

  /**
   * Check if WalletConnect is properly configured
   */
  isConfigured(): boolean {
    return !!this.PROJECT_ID;
  }
}

export const walletConnectService = new WalletConnectService();