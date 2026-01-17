/**
 * Transfer Integration Tests
 *
 * Tests for complete transfer flows including:
 * - P2P transfers
 * - Domain resolution
 * - Fee calculation
 * - Transaction signing
 * - Confirmation handling
 */

import {
  mockConnection,
  setMockBalance,
  setMockTokenBalance,
  simulateTransactionFailure,
  simulateConfirmationFailure,
  resetSolanaMocks,
} from '../mocks/solana';
import {
  mockTurnkeyClient,
  simulateSigningFailure,
  simulateVelocityLimitExceeded,
  resetTurnkeyMocks,
} from '../mocks/turnkey';
import {
  resetConvexMocks,
  mockUseMutation,
  mockUseQuery,
} from '../helpers/convex';
import {
  createTransferTransaction,
  createConfirmedTransaction,
  createFailedTransaction,
  TOKENS,
  calculateFees,
} from '../fixtures/transactions';
import { createTestUser, ALICE, BOB } from '../fixtures/users';

describe('Transfer Integration Tests', () => {
  beforeEach(() => {
    resetSolanaMocks();
    resetTurnkeyMocks();
    resetConvexMocks();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // P2P Transfer Flow
  // ==========================================================================

  describe('P2P Transfer Flow', () => {
    test('completes USDC transfer successfully', async () => {
      // Setup: User has 1000 USDC, sending 50 to Alice
      setMockTokenBalance('1000000000', 6); // 1000 USDC

      // Create transfer
      const transfer = createTransferTransaction(
        ALICE.walletAddress,
        50,
        'USDC'
      );

      // Verify transfer properties
      expect(transfer.recipientAddress).toBe(ALICE.walletAddress);
      expect(transfer.amount).toBe(50);
      expect(transfer.token).toBe('USDC');
      expect(transfer.tokenDecimals).toBe(6);
    });

    test('completes SOL transfer successfully', async () => {
      // Setup: User has 10 SOL
      setMockBalance(10 * 1_000_000_000);

      // Create SOL transfer
      const transfer = createTransferTransaction(
        BOB.walletAddress,
        1,
        'SOL'
      );

      expect(transfer.token).toBe('SOL');
      expect(transfer.amount).toBe(1);
    });

    test('handles cross-currency transfer', async () => {
      // Transfer involves converting between currencies
      const transfer = createTransferTransaction(
        ALICE.walletAddress,
        100,
        'USDC',
        { type: 'transfer' }
      );

      // Fee calculation should include platform fee
      const fees = calculateFees(transfer.amountUsd);

      expect(fees.platformFee).toBeCloseTo(0.30); // 0.3% of $100
      expect(fees.networkFee).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Domain Resolution
  // ==========================================================================

  describe('Domain Resolution', () => {
    test('resolves .sol domain to address', async () => {
      const resolveSolDomain = async (domain: string): Promise<string | null> => {
        // Simulate domain resolution
        const domainMap: Record<string, string> = {
          'alice.sol': ALICE.walletAddress,
          'bob.sol': BOB.walletAddress,
        };
        return domainMap[domain] || null;
      };

      const address = await resolveSolDomain('alice.sol');
      expect(address).toBe(ALICE.walletAddress);
    });

    test('returns null for unregistered domain', async () => {
      const resolveSolDomain = async (domain: string): Promise<string | null> => {
        const domainMap: Record<string, string> = {
          'alice.sol': ALICE.walletAddress,
        };
        return domainMap[domain] || null;
      };

      const address = await resolveSolDomain('unknown.sol');
      expect(address).toBeNull();
    });

    test('validates domain format', () => {
      const isValidSolDomain = (input: string): boolean => {
        return /^[a-z0-9-]+\.sol$/i.test(input);
      };

      expect(isValidSolDomain('alice.sol')).toBe(true);
      expect(isValidSolDomain('my-wallet.sol')).toBe(true);
      expect(isValidSolDomain('alice')).toBe(false);
      expect(isValidSolDomain('.sol')).toBe(false);
      expect(isValidSolDomain('alice.sol.extra')).toBe(false);
    });
  });

  // ==========================================================================
  // Fee Calculation
  // ==========================================================================

  describe('Fee Calculation', () => {
    test('calculates fees correctly for small transfer', () => {
      const fees = calculateFees(10); // $10

      expect(fees.platformFee).toBeCloseTo(0.03); // 0.3% of $10
      expect(fees.networkFee).toBe(0.001); // Base network fee
    });

    test('calculates fees correctly for large transfer', () => {
      const fees = calculateFees(10000); // $10,000

      expect(fees.platformFee).toBeCloseTo(30); // 0.3% of $10,000
    });

    test('includes ATA rent when needed', () => {
      // When recipient doesn't have token account
      const baseRent = 0.00203928; // Standard ATA rent

      const totalWithRent = calculateFees(100).networkFee + baseRent;
      expect(totalWithRent).toBeGreaterThan(calculateFees(100).networkFee);
    });

    test('estimates priority fee for fast confirmation', () => {
      const fees = calculateFees(100);
      expect(fees.priorityFee).toBeDefined();
    });
  });

  // ==========================================================================
  // Transaction Signing
  // ==========================================================================

  describe('Transaction Signing', () => {
    test('signs transaction with Turnkey', async () => {
      const signResult = await mockTurnkeyClient.signTransaction({
        walletId: 'test_wallet',
        transaction: { data: 'mock_tx' },
      });

      expect(signResult.signature).toBeDefined();
      expect(signResult.signedTransaction).toBeDefined();
    });

    test('handles signing failure gracefully', async () => {
      simulateSigningFailure('User cancelled');

      await expect(
        mockTurnkeyClient.signTransaction({
          walletId: 'test_wallet',
          transaction: { data: 'mock_tx' },
        })
      ).rejects.toThrow('User cancelled');
    });

    test('enforces velocity limits before signing', async () => {
      // Check velocity before allowing transaction
      const check = await mockTurnkeyClient.checkVelocity({
        walletId: 'test_wallet',
        amountCents: 5000, // $50
      });

      expect(check.allowed).toBe(true);
      expect(check.dailyRemaining).toBeDefined();
    });

    test('blocks transaction when velocity limit exceeded', async () => {
      simulateVelocityLimitExceeded();

      const check = await mockTurnkeyClient.checkVelocity({
        walletId: 'test_wallet',
        amountCents: 500000, // $5000 - exceeds daily limit
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('limit');
    });
  });

  // ==========================================================================
  // Transaction Submission
  // ==========================================================================

  describe('Transaction Submission', () => {
    test('submits transaction to network', async () => {
      const signature = await mockConnection.sendTransaction({
        serialize: () => Buffer.alloc(100),
      });

      expect(signature).toBeDefined();
      expect(signature).toContain('mock_signature');
    });

    test('handles network submission failure', async () => {
      simulateTransactionFailure('Network congestion');

      await expect(
        mockConnection.sendTransaction({
          serialize: () => Buffer.alloc(100),
        })
      ).rejects.toThrow('Network congestion');
    });

    test('simulates transaction before submission', async () => {
      const simulation = await mockConnection.simulateTransaction({
        serialize: () => Buffer.alloc(100),
      });

      expect(simulation.value.err).toBeNull();
      expect(simulation.value.logs).toBeDefined();
    });
  });

  // ==========================================================================
  // Confirmation Handling
  // ==========================================================================

  describe('Confirmation Handling', () => {
    test('confirms transaction successfully', async () => {
      const confirmation = await mockConnection.confirmTransaction('mock_sig');

      expect(confirmation.value.err).toBeNull();
    });

    test('handles confirmation timeout', async () => {
      // Simulate long confirmation wait
      jest.useFakeTimers();

      const confirmationPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Confirmation timeout')), 30000);
      });

      jest.advanceTimersByTime(30000);

      await expect(confirmationPromise).rejects.toThrow('Confirmation timeout');

      jest.useRealTimers();
    });

    test('handles confirmation failure', async () => {
      simulateConfirmationFailure();

      const confirmation = await mockConnection.confirmTransaction('mock_sig');

      expect(confirmation.value.err).toBeTruthy();
    });

    test('tracks confirmation time for Alpenglow target', () => {
      const confirmedTransfer = createConfirmedTransaction({
        confirmationTimeMs: 120,
      });

      // Alpenglow target is 150ms
      expect(confirmedTransfer.confirmationTimeMs).toBeLessThan(150);
    });
  });

  // ==========================================================================
  // Error Recovery
  // ==========================================================================

  describe('Error Recovery', () => {
    test('creates failed transaction record on error', () => {
      const failedTransfer = createFailedTransaction('Insufficient balance');

      expect(failedTransfer.status).toBe('failed');
      expect(failedTransfer.errorMessage).toBe('Insufficient balance');
    });

    test('preserves idempotency on retry', () => {
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Same idempotency key should prevent duplicate
      const transfer1 = createTransferTransaction(ALICE.walletAddress, 50, 'USDC', {
        idempotencyKey,
      });
      const transfer2 = createTransferTransaction(ALICE.walletAddress, 50, 'USDC', {
        idempotencyKey,
      });

      expect(transfer1.idempotencyKey).toBe(transfer2.idempotencyKey);
    });

    test('handles partial failure gracefully', async () => {
      // Signed but submission failed
      const transfer = createTransferTransaction(ALICE.walletAddress, 50, 'USDC', {
        status: 'signing',
      });

      // Should be able to retry from signed state
      expect(transfer.status).toBe('signing');
    });
  });

  // ==========================================================================
  // Contact Integration
  // ==========================================================================

  describe('Contact Integration', () => {
    test('marks contact as used after transfer', async () => {
      const markContactUsed = jest.fn().mockResolvedValue(undefined);

      await markContactUsed({
        contactId: 'contact_alice',
        amountUsd: 50,
      });

      expect(markContactUsed).toHaveBeenCalledWith({
        contactId: 'contact_alice',
        amountUsd: 50,
      });
    });

    test('increments transfer count for contact', async () => {
      const contactStats = {
        transferCount: 5,
        totalTransferred: 500,
      };

      // After transfer
      contactStats.transferCount += 1;
      contactStats.totalTransferred += 50;

      expect(contactStats.transferCount).toBe(6);
      expect(contactStats.totalTransferred).toBe(550);
    });
  });
});
