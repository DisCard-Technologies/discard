/**
 * Turnkey TEE Mock
 *
 * Mocks Turnkey SDK for testing wallet operations and signing.
 */

// ============================================================================
// Mock Wallet Data
// ============================================================================

interface MockWallet {
  walletId: string;
  walletAddress: string;
  organizationId: string;
  userId: string;
  createdAt: Date;
}

interface MockSignedTransaction {
  signedTransaction: Uint8Array;
  signature: string;
}

const mockWallets = new Map<string, MockWallet>();

// Default test wallet
const defaultWallet: MockWallet = {
  walletId: 'test_wallet_001',
  walletAddress: 'test_wallet_address_' + '1'.repeat(32),
  organizationId: 'test_org_001',
  userId: 'test_user_001',
  createdAt: new Date(),
};

mockWallets.set(defaultWallet.walletId, defaultWallet);

// ============================================================================
// Mock State
// ============================================================================

let currentWallet: MockWallet | null = defaultWallet;
let shouldFailSigning = false;
let signingError: string | null = null;
let shouldFailVelocityCheck = false;
let velocityLimitExceeded = false;

// ============================================================================
// Mock Velocity Check Result
// ============================================================================

export interface MockVelocityCheckResult {
  allowed: boolean;
  reason?: string;
  dailyRemaining?: number;
  monthlyRemaining?: number;
  currentDailySpend?: number;
  currentMonthlySpend?: number;
}

// ============================================================================
// Mock Functions
// ============================================================================

export const mockTurnkeyClient = {
  createWallet: jest.fn().mockImplementation(async (params: {
    organizationId: string;
    userId: string;
  }): Promise<MockWallet> => {
    const wallet: MockWallet = {
      walletId: `wallet_${Date.now()}`,
      walletAddress: `addr_${Date.now()}_${'1'.repeat(32)}`.slice(0, 44),
      organizationId: params.organizationId,
      userId: params.userId,
      createdAt: new Date(),
    };
    mockWallets.set(wallet.walletId, wallet);
    currentWallet = wallet;
    return wallet;
  }),

  getWallet: jest.fn().mockImplementation(async (walletId: string): Promise<MockWallet | null> => {
    return mockWallets.get(walletId) || null;
  }),

  signTransaction: jest.fn().mockImplementation(async (params: {
    walletId: string;
    transaction: any;
  }): Promise<MockSignedTransaction> => {
    if (shouldFailSigning) {
      throw new Error(signingError || 'Signing failed');
    }

    // Return mock signed transaction
    const signature = `sig_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return {
      signedTransaction: new Uint8Array(200).fill(1),
      signature,
    };
  }),

  signMessage: jest.fn().mockImplementation(async (params: {
    walletId: string;
    message: Uint8Array;
  }): Promise<{ signature: Uint8Array }> => {
    if (shouldFailSigning) {
      throw new Error(signingError || 'Signing failed');
    }

    return {
      signature: new Uint8Array(64).fill(2),
    };
  }),

  checkVelocity: jest.fn().mockImplementation(async (params: {
    walletId: string;
    amountCents: number;
  }): Promise<MockVelocityCheckResult> => {
    if (shouldFailVelocityCheck) {
      return {
        allowed: false,
        reason: 'Velocity check failed',
      };
    }

    if (velocityLimitExceeded) {
      return {
        allowed: false,
        reason: 'Daily spending limit exceeded',
        dailyRemaining: 0,
        monthlyRemaining: 500000, // $5000
        currentDailySpend: 100000, // $1000
        currentMonthlySpend: 200000, // $2000
      };
    }

    return {
      allowed: true,
      dailyRemaining: 100000 - params.amountCents, // $1000 daily limit
      monthlyRemaining: 500000 - params.amountCents, // $5000 monthly limit
      currentDailySpend: params.amountCents,
      currentMonthlySpend: params.amountCents,
    };
  }),

  exportWallet: jest.fn().mockImplementation(async (walletId: string): Promise<{
    mnemonic?: string;
    privateKey?: string;
  }> => {
    // Never return actual keys in tests - this is intentional
    throw new Error('Wallet export not supported in test environment');
  }),
};

// ============================================================================
// Mock Passkey Stamper
// ============================================================================

export const mockPasskeyStamper = {
  stamp: jest.fn(async (payload: string): Promise<{
    stampHeaderName: string;
    stampHeaderValue: string;
  }> => {
    return {
      stampHeaderName: 'X-Stamp',
      stampHeaderValue: `stamp_${Date.now()}`,
    };
  }),
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Set the current wallet for testing
 */
export const setCurrentWallet = (wallet: MockWallet | null) => {
  currentWallet = wallet;
  if (wallet) {
    mockWallets.set(wallet.walletId, wallet);
  }
};

/**
 * Get the current wallet
 */
export const getCurrentWallet = (): MockWallet | null => {
  return currentWallet;
};

/**
 * Simulate signing failure
 */
export const simulateSigningFailure = (error?: string) => {
  shouldFailSigning = true;
  signingError = error || null;
};

/**
 * Simulate velocity limit exceeded
 */
export const simulateVelocityLimitExceeded = () => {
  velocityLimitExceeded = true;
};

/**
 * Simulate velocity check failure (system error)
 */
export const simulateVelocityCheckFailure = () => {
  shouldFailVelocityCheck = true;
};

/**
 * Reset all Turnkey mocks
 */
export const resetTurnkeyMocks = () => {
  mockWallets.clear();
  mockWallets.set(defaultWallet.walletId, defaultWallet);
  currentWallet = defaultWallet;
  shouldFailSigning = false;
  signingError = null;
  shouldFailVelocityCheck = false;
  velocityLimitExceeded = false;

  mockTurnkeyClient.createWallet.mockClear();
  mockTurnkeyClient.getWallet.mockClear();
  mockTurnkeyClient.signTransaction.mockClear();
  mockTurnkeyClient.signMessage.mockClear();
  mockTurnkeyClient.checkVelocity.mockClear();
  mockPasskeyStamper.stamp.mockClear();
};

/**
 * Create a test wallet with specific properties
 */
export const createTestWallet = (overrides: Partial<MockWallet> = {}): MockWallet => {
  const wallet: MockWallet = {
    walletId: `wallet_test_${Date.now()}`,
    walletAddress: `addr_test_${Date.now()}`.padEnd(44, '1'),
    organizationId: 'test_org',
    userId: 'test_user',
    createdAt: new Date(),
    ...overrides,
  };
  mockWallets.set(wallet.walletId, wallet);
  return wallet;
};

// Export mock for direct use in tests
export default mockTurnkeyClient;
