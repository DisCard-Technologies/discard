/**
 * Improved WalletConnect service tests using dependency injection and better mocking
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { WalletConnectService } from '../../../../services/crypto/walletconnect.service';
import { CRYPTO_ERROR_CODES } from '@discard/shared/src/types/crypto';

// Mock the SignClient constructor with factory function
jest.mock('@walletconnect/sign-client', () => ({
  SignClient: {
    init: jest.fn().mockResolvedValue({
      connect: jest.fn(),
      disconnect: jest.fn(),
      session: {
        getAll: jest.fn().mockReturnValue([])
      },
      proposal: {
        get: jest.fn()
      },
      on: jest.fn(),
      init: jest.fn().mockResolvedValue(undefined)
    })
  }
}));

jest.mock('../../../../app', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      then: jest.fn((resolve: any) => resolve({ data: [], error: null }))
    }))
  }
}));

describe('WalletConnectService - Improved Tests', () => {
  let walletConnectService: WalletConnectService;
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Set required environment variables
    process.env.WALLETCONNECT_PROJECT_ID = 'test-project-id';
    process.env.WALLETCONNECT_RELAY_URL = 'wss://relay.walletconnect.com';
    
    walletConnectService = new WalletConnectService();
  });

  afterEach(() => {
    delete process.env.WALLETCONNECT_PROJECT_ID;
    delete process.env.WALLETCONNECT_RELAY_URL;
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid config', async () => {
      expect(walletConnectService).toBeInstanceOf(WalletConnectService);
    });

    it('should handle missing project ID', () => {
      delete process.env.WALLETCONNECT_PROJECT_ID;
      expect(() => new WalletConnectService()).toThrow('WalletConnect project ID not configured');
    });
  });

  describe('Session Management', () => {
    it('should handle missing WalletConnect initialization', async () => {
      // Test the case where WalletConnect is not initialized
      await expect(
        walletConnectService.createSessionProposal({
          requiredNamespaces: {
            eip155: {
              methods: ['eth_sendTransaction'],
              chains: ['eip155:1'],
              events: ['accountsChanged']
            }
          },
          optionalNamespaces: {},
          sessionProperties: {}
        })
      ).rejects.toMatchObject({
        code: CRYPTO_ERROR_CODES.WALLETCONNECT_SESSION_FAILED,
        message: 'Failed to create WalletConnect session proposal'
      });
    });

    it('should handle missing required parameters', async () => {
      await expect(
        walletConnectService.createSessionProposal({} as any)
      ).rejects.toMatchObject({
        code: CRYPTO_ERROR_CODES.WALLETCONNECT_SESSION_FAILED
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should validate WalletConnect configuration', () => {
      const isConfigured = walletConnectService.isConfigured();
      expect(isConfigured).toBe(true);
    });

    it('should detect missing configuration', () => {
      delete process.env.WALLETCONNECT_PROJECT_ID;
      const newService = new WalletConnectService();
      expect(newService.isConfigured()).toBe(false);
    });
  });
});