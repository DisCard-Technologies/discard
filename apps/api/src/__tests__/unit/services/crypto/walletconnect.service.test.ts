import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Set environment variables before importing the service
process.env.WALLETCONNECT_PROJECT_ID = 'test-project-id';
process.env.WALLETCONNECT_RELAY_URL = 'wss://test-relay.walletconnect.com';
process.env.APP_URL = 'https://test.discard.app';

import { walletConnectService } from '../../../../services/crypto/walletconnect.service';

// Mock WalletConnect SDK
const mockSignClient = {
  init: jest.fn(),
  on: jest.fn(),
  connect: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
  disconnect: jest.fn(),
  respond: jest.fn(),
  session: {
    getAll: jest.fn().mockReturnValue([])
  }
};

jest.mock('@walletconnect/sign-client', () => ({
  SignClient: {
    init: jest.fn()
  }
}));

jest.mock('@walletconnect/utils', () => ({
  getSdkError: jest.fn((error: string) => ({ code: error, message: `SDK Error: ${error}` }))
}));

jest.mock('@walletconnect/types', () => ({}));

jest.mock('@walletconnect/modal', () => ({}));

// Use SupabaseMockFactory for reliable database mocking
import { SupabaseMockFactory } from '../../../factories/supabase-mock.factory';

const mockSupabaseChain = SupabaseMockFactory.createChainableMock();

jest.mock('../../../../app', () => ({
  supabase: {
    from: jest.fn(() => mockSupabaseChain)
  }
}));

// MSW will handle fetch interception automatically via setupFilesAfterEnv

describe('WalletConnectService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment variables for testing
    process.env.WALLETCONNECT_PROJECT_ID = 'test-project-id';
    process.env.WALLETCONNECT_RELAY_URL = 'wss://test-relay.walletconnect.com';
    process.env.APP_URL = 'https://test.discard.app';

    // Reset mock functions
    Object.values(mockSignClient).forEach(fn => {
      if (typeof fn === 'function') {
        (fn as jest.Mock).mockClear();
      }
    });
    
    // Reset Supabase mock to chainable state
    SupabaseMockFactory.clearMock(mockSupabaseChain);

    // Mock the SignClient.init to return our mock
    const { SignClient } = require('@walletconnect/sign-client');
    SignClient.init.mockResolvedValue(mockSignClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clean up environment variables
    delete process.env.WALLETCONNECT_PROJECT_ID;
    delete process.env.WALLETCONNECT_RELAY_URL;
    delete process.env.APP_URL;
  });

  describe('initialization', () => {
    it('should initialize WalletConnect SignClient successfully', async () => {
      await walletConnectService.initialize();

      const { SignClient } = require('@walletconnect/sign-client');
      expect(SignClient.init).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        relayUrl: 'wss://test-relay.walletconnect.com',
        metadata: {
          name: 'DisCard',
          description: 'Privacy-focused digital payment cards with cryptocurrency integration',
          url: 'https://test.discard.app',
          icons: ['https://discard.app/icon.png']
        }
      });

      expect(mockSignClient.on).toHaveBeenCalledWith('session_proposal', expect.any(Function));
      expect(mockSignClient.on).toHaveBeenCalledWith('session_update', expect.any(Function));
      expect(mockSignClient.on).toHaveBeenCalledWith('session_delete', expect.any(Function));
      expect(mockSignClient.on).toHaveBeenCalledWith('session_expire', expect.any(Function));
      expect(mockSignClient.on).toHaveBeenCalledWith('session_request', expect.any(Function));
      expect(mockSignClient.on).toHaveBeenCalledWith('session_request', expect.any(Function));
    });

    it('should not initialize twice', async () => {
      // First initialization
      await walletConnectService.initialize();
      
      // Clear previous calls
      const { SignClient } = require('@walletconnect/sign-client');
      SignClient.init.mockClear();
      
      // Second initialization should not call SignClient.init again
      await walletConnectService.initialize();

      expect(SignClient.init).toHaveBeenCalledTimes(0);
    });

    it('should handle initialization errors', async () => {
      const { SignClient } = require('@walletconnect/sign-client');
      SignClient.init.mockRejectedValue(new Error('Initialization failed'));
      
      // Create a fresh service instance for this test
      const newService = new (require('../../../../services/crypto/walletconnect.service').WalletConnectService)();

      await expect(newService.initialize()).rejects.toThrow('WalletConnect initialization failed');
    });
  });

  describe('configuration', () => {
    it('should return true when properly configured', () => {
      expect(walletConnectService.isConfigured()).toBe(true);
    });

    it('should return false when PROJECT_ID is missing', () => {
      delete process.env.WALLETCONNECT_PROJECT_ID;
      
      // Create a new instance to test configuration
      const { WalletConnectService } = require('../../../../services/crypto/walletconnect.service');
      const newService = new WalletConnectService();
      
      expect(newService.isConfigured()).toBe(false);
    });
  });

  describe('createSessionProposal', () => {
    it('should create a session proposal successfully', async () => {
      const mockUri = 'wc:test-uri@1?bridge=test&key=test';
      const mockApproval = Promise.resolve({ topic: 'test-topic' });

      mockSignClient.connect.mockResolvedValue({
        uri: mockUri,
        approval: mockApproval
      });

      await walletConnectService.initialize();

      const result = await walletConnectService.createSessionProposal('test-user-id', {
        requiredNamespaces: ['eip155'],
        sessionDuration: 3600
      });

      expect(result.uri).toBe(mockUri);
      expect(result.proposalId).toBeDefined();
      expect(typeof result.proposalId).toBe('string');

      // Check that connect was called with the correct structure
      expect(mockSignClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredNamespaces: expect.objectContaining({
            eip155: expect.objectContaining({
              chains: expect.arrayContaining(['eip155:1', 'eip155:137', 'eip155:56', 'eip155:42161']),
              events: expect.arrayContaining(['accountsChanged', 'chainChanged'])
            })
          }),
          optionalNamespaces: {},
          sessionProperties: expect.objectContaining({
            userId: 'test-user-id',
            appName: 'DisCard',
            sessionDuration: '3600'
          })
        })
      );
    });

    it('should handle connection errors', async () => {
      mockSignClient.connect.mockRejectedValue(new Error('Connection failed'));
      await walletConnectService.initialize();

      await expect(
        walletConnectService.createSessionProposal('test-user-id', {
          requiredNamespaces: ['eip155']
        })
      ).rejects.toMatchObject({
        code: 'WALLETCONNECT_SESSION_FAILED',
        message: 'Failed to create WalletConnect session proposal'
      });
    });

    it('should handle missing URI in connection response', async () => {
      mockSignClient.connect.mockResolvedValue({
        uri: null,
        approval: Promise.resolve({ topic: 'test-topic' })
      });

      await walletConnectService.initialize();

      await expect(
        walletConnectService.createSessionProposal('test-user-id', {
          requiredNamespaces: ['eip155']
        })
      ).rejects.toMatchObject({
        code: 'WALLETCONNECT_SESSION_FAILED',
        message: 'Failed to create WalletConnect session proposal'
      });
    });
  });

  describe('approveSessionProposal', () => {
    it('should approve a session proposal successfully', async () => {
      await walletConnectService.initialize();

      // Add a pending proposal
      const proposalId = 'test-proposal-id';
      const mockProposal = {
        id: 123,
        params: {
          proposer: {
            metadata: {
              name: 'Test Wallet'
            }
          }
        },
        expiryTimestamp: Date.now() + 300000 // 5 minutes from now
      };

      // Manually add proposal to test approval
      (walletConnectService as any).pendingProposals.set(proposalId, mockProposal);

      const mockSession = {
        topic: 'test-topic',
        expiry: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      };

      mockSignClient.approve.mockResolvedValue(mockSession);

      // Mock database response
      mockSupabaseChain.insert.mockResolvedValue({ data: null, error: null });

      const accounts = ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'];
      const result = await walletConnectService.approveSessionProposal(
        proposalId,
        'test-user-id',
        accounts
      );

      expect(result.topic).toBe('test-topic');
      expect(result.walletAddress).toBe(accounts[0]);
      expect(result.walletName).toBe('Test Wallet');
      expect(mockSignClient.approve).toHaveBeenCalledWith({
        id: 123,
        namespaces: {
          eip155: {
            accounts: ['eip155:1:0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
            methods: expect.arrayContaining(['eth_sendTransaction', 'personal_sign']),
            events: ['accountsChanged', 'chainChanged']
          }
        }
      });
    });

    it('should handle proposal not found', async () => {
      await walletConnectService.initialize();

      await expect(
        walletConnectService.approveSessionProposal(
          'non-existent-proposal',
          'test-user-id',
          ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca']
        )
      ).rejects.toMatchObject({
        code: 'WALLETCONNECT_SESSION_FAILED',
        message: 'Failed to approve WalletConnect session'
      });
    });

    it('should handle expired proposal', async () => {
      await walletConnectService.initialize();

      const proposalId = 'expired-proposal-id';
      const expiredProposal = {
        id: 123,
        params: { proposer: { metadata: { name: 'Test Wallet' } } },
        expiryTimestamp: Date.now() - 1000 // 1 second ago (expired)
      };

      (walletConnectService as any).pendingProposals.set(proposalId, expiredProposal);

      await expect(
        walletConnectService.approveSessionProposal(
          proposalId,
          'test-user-id',
          ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca']
        )
      ).rejects.toMatchObject({
        code: 'WALLETCONNECT_SESSION_FAILED',
        message: 'Failed to approve WalletConnect session'
      });
    });
  });

  describe('rejectSessionProposal', () => {
    it('should reject a session proposal successfully', async () => {
      await walletConnectService.initialize();

      const proposalId = 'test-proposal-id';
      const mockProposal = {
        id: 123,
        params: { proposer: { metadata: { name: 'Test Wallet' } } },
        expiryTimestamp: Date.now() + 300000
      };

      (walletConnectService as any).pendingProposals.set(proposalId, mockProposal);

      await walletConnectService.rejectSessionProposal(proposalId, 'User rejected');

      expect(mockSignClient.reject).toHaveBeenCalledWith({
        id: 123,
        reason: { code: 'USER_REJECTED', message: 'SDK Error: USER_REJECTED' }
      });

      // Proposal should be removed
      expect((walletConnectService as any).pendingProposals.has(proposalId)).toBe(false);
    });

    it('should handle proposal not found during rejection', async () => {
      await walletConnectService.initialize();

      await expect(
        walletConnectService.rejectSessionProposal('non-existent-proposal')
      ).rejects.toThrow('Proposal not found');
    });
  });

  describe('disconnectSession', () => {
    it('should disconnect a session successfully', async () => {
      await walletConnectService.initialize();

      const topic = 'test-topic';
      
      // Add session to active sessions
      (walletConnectService as any).activeSessions.set(topic, {
        sessionId: 'test-session-id',
        topic: topic,
        walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'
      });

      // Mock database response
      mockSupabaseChain.update.mockResolvedValue({ data: null, error: null });

      await walletConnectService.disconnectSession(topic);

      expect(mockSignClient.disconnect).toHaveBeenCalledWith({
        topic: topic,
        reason: { code: 'USER_DISCONNECTED', message: 'SDK Error: USER_DISCONNECTED' }
      });

      // Session should be removed from active sessions
      expect((walletConnectService as any).activeSessions.has(topic)).toBe(false);
    });
  });

  describe('getActiveSessions', () => {
    it('should return active sessions for a user', async () => {
      const mockDatabaseSessions = [
        {
          session_id: 'session-1',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          permissions: ['eth_sendTransaction'],
          connection_metadata: {
            walletconnect_topic: 'topic-1',
            wallet_address: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
            wallet_name: 'Test Wallet',
            chain_ids: ['eip155:1'],
            methods: ['eth_sendTransaction']
          }
        }
      ];

      // Mock the chain properly to return the resolved value
      mockSupabaseChain.eq.mockReturnThis();
      mockSupabaseChain.not.mockResolvedValue({
        data: mockDatabaseSessions,
        error: null
      });

      const sessions = await walletConnectService.getActiveSessions('test-user-id');

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        sessionId: 'session-1',
        topic: 'topic-1',
        walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
        walletName: 'Test Wallet',
        permissions: ['eth_sendTransaction'],
        chainIds: ['eip155:1'],
        methods: ['eth_sendTransaction']
      });
    });

    it('should handle database errors gracefully', async () => {
      // Reset all mocks first
      Object.values(mockSupabaseChain).forEach(mock => mock.mockClear && mock.mockClear());
      
      // Mock database error at the final `.not()` call which is what getActiveSessions uses
      mockSupabaseChain.not.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      const sessions = await walletConnectService.getActiveSessions('test-user-id');

      expect(sessions).toEqual([]);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired proposals and sessions', async () => {
      await walletConnectService.initialize();

      // Add expired proposal
      const expiredProposalId = 'expired-proposal';
      (walletConnectService as any).pendingProposals.set(expiredProposalId, {
        id: 123,
        params: {},
        expiryTimestamp: Date.now() - 1000 // Expired
      });

      // Add valid proposal
      const validProposalId = 'valid-proposal';
      (walletConnectService as any).pendingProposals.set(validProposalId, {
        id: 124,
        params: {},
        expiryTimestamp: Date.now() + 300000 // Valid
      });

      // Add expired session
      const expiredSessionTopic = 'expired-session';
      (walletConnectService as any).activeSessions.set(expiredSessionTopic, {
        sessionId: 'expired-session-id',
        topic: expiredSessionTopic,
        expiryTimestamp: Math.floor((Date.now() - 1000) / 1000) // Expired (in seconds)
      });

      await walletConnectService.cleanupExpiredSessions();

      // Expired proposal should be removed
      expect((walletConnectService as any).pendingProposals.has(expiredProposalId)).toBe(false);
      
      // Valid proposal should remain
      expect((walletConnectService as any).pendingProposals.has(validProposalId)).toBe(true);
      
      // Expired session should be removed
      expect((walletConnectService as any).activeSessions.has(expiredSessionTopic)).toBe(false);
    });
  });

  describe('event handling', () => {
    it('should set up event listeners during initialization', async () => {
      // Create a fresh service instance to ensure clean state
      const newService = new (require('../../../../services/crypto/walletconnect.service').WalletConnectService)();
      
      await newService.initialize();

      expect(mockSignClient.on).toHaveBeenCalledWith('session_proposal', expect.any(Function));
      expect(mockSignClient.on).toHaveBeenCalledWith('session_update', expect.any(Function));
      expect(mockSignClient.on).toHaveBeenCalledWith('session_delete', expect.any(Function));
      expect(mockSignClient.on).toHaveBeenCalledWith('session_expire', expect.any(Function));
      expect(mockSignClient.on).toHaveBeenCalledWith('session_request', expect.any(Function));
      expect(mockSignClient.on).toHaveBeenCalledWith('session_request', expect.any(Function));
    });
  });

  describe('getSignClient', () => {
    it('should return the SignClient instance', async () => {
      // Create a fresh service instance for this test
      const newService = new (require('../../../../services/crypto/walletconnect.service').WalletConnectService)();
      
      // Before initialization, SignClient should be null
      const initialClient = newService.getSignClient();
      expect(initialClient).toBeNull();
      
      await newService.initialize();
      
      // After initialization, SignClient should be available
      const client = newService.getSignClient();
      expect(client).not.toBeNull();
      expect(client).toBe(mockSignClient);
    });
  });
});