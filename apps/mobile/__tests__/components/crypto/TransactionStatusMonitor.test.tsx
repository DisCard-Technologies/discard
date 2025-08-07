import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { TransactionStatusMonitor } from '../../../src/components/crypto/TransactionStatusMonitor';
import { useCryptoStore } from '../../../src/stores/crypto';
import { useWebSocketConnection } from '../../../src/hooks/useWebSocketConnection';

// Mock dependencies
jest.mock('../../../src/stores/crypto', () => ({
  useCryptoStore: jest.fn()
}));

jest.mock('../../../src/hooks/useWebSocketConnection', () => ({
  useWebSocketConnection: jest.fn()
}));

describe('TransactionStatusMonitor', () => {
  const mockGetTransactionStatus = jest.fn();
  const mockAccelerateTransaction = jest.fn();
  const mockSend = jest.fn();
  
  const defaultProps = {
    transactionId: 'test-tx-123',
    cardId: 'test-card-456'
  };

  const mockTransaction = {
    processingId: 'proc-123',
    transactionId: 'test-tx-123',
    status: 'confirming',
    confirmationCount: 2,
    requiredConfirmations: 3,
    estimatedCompletion: new Date(Date.now() + 15 * 60000).toISOString(), // 15 minutes from now
    networkType: 'BTC',
    accelerationOptions: [],
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  const mockCryptoStore = {
    getTransactionStatus: mockGetTransactionStatus,
    accelerateTransaction: mockAccelerateTransaction,
    isLoading: false
  };

  const mockWebSocket = {
    isConnected: true,
    isConnecting: false,
    lastMessage: null,
    send: mockSend,
    connect: jest.fn(),
    disconnect: jest.fn(),
    connectionAttempts: 0
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useCryptoStore as jest.Mock).mockReturnValue(mockCryptoStore);
    (useWebSocketConnection as jest.Mock).mockReturnValue(mockWebSocket);
    mockGetTransactionStatus.mockResolvedValue(mockTransaction);
  });

  describe('Loading State', () => {
    it('should show loading state when transaction is not loaded', () => {
      mockGetTransactionStatus.mockResolvedValue(null);

      render(<TransactionStatusMonitor {...defaultProps} />);

      expect(screen.getByText('Loading transaction status...')).toBeTruthy();
    });
  });

  describe('Transaction Status Display', () => {
    it('should display transaction status correctly', async () => {
      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('CONFIRMING')).toBeTruthy();
        expect(screen.getByText('BTC')).toBeTruthy();
        expect(screen.getByText('2 / 3')).toBeTruthy();
      });
    });

    it('should show correct status icons for different statuses', async () => {
      const statuses = [
        { status: 'initiated', icon: '🚀' },
        { status: 'pending', icon: '⏳' },
        { status: 'confirming', icon: '⚡' },
        { status: 'confirmed', icon: '✅' },
        { status: 'failed', icon: '❌' },
        { status: 'refunded', icon: '↩️' }
      ];

      for (const { status, icon } of statuses) {
        const transaction = { ...mockTransaction, status };
        mockGetTransactionStatus.mockResolvedValue(transaction);

        const { unmount } = render(<TransactionStatusMonitor {...defaultProps} />);

        await waitFor(() => {
          expect(screen.getByText(icon)).toBeTruthy();
        });

        unmount();
      }
    });

    it('should calculate progress percentage correctly', async () => {
      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        // 2 out of 3 confirmations = 67%
        expect(screen.getByText('67%')).toBeTruthy();
      });
    });

    it('should show 100% progress for confirmed transactions', async () => {
      const confirmedTransaction = {
        ...mockTransaction,
        status: 'confirmed',
        confirmationCount: 3,
        completedAt: new Date().toISOString()
      };
      mockGetTransactionStatus.mockResolvedValue(confirmedTransaction);

      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('100%')).toBeTruthy();
        expect(screen.getByText(/Completed:/)).toBeTruthy();
      });
    });
  });

  describe('WebSocket Integration', () => {
    it('should show connection status', async () => {
      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Live')).toBeTruthy();
      });
    });

    it('should show offline status when WebSocket disconnected', async () => {
      const disconnectedWebSocket = {
        ...mockWebSocket,
        isConnected: false
      };
      (useWebSocketConnection as jest.Mock).mockReturnValue(disconnectedWebSocket);

      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Offline')).toBeTruthy();
      });
    });

    it('should handle WebSocket messages and update transaction status', async () => {
      const onStatusChange = jest.fn();

      const { rerender } = render(
        <TransactionStatusMonitor {...defaultProps} onStatusChange={onStatusChange} />
      );

      await waitFor(() => {
        expect(screen.getByText('CONFIRMING')).toBeTruthy();
      });

      // Simulate WebSocket message
      const updatedTransaction = { ...mockTransaction, status: 'confirmed', confirmationCount: 3 };
      const mockMessage = {
        type: 'TRANSACTION_STATUS_UPDATE',
        payload: {
          transactionId: 'test-tx-123',
          processing: updatedTransaction
        }
      };

      // Mock the WebSocket hook to return the message
      const updatedWebSocket = {
        ...mockWebSocket,
        lastMessage: mockMessage
      };
      (useWebSocketConnection as jest.Mock).mockReturnValue(updatedWebSocket);

      rerender(<TransactionStatusMonitor {...defaultProps} onStatusChange={onStatusChange} />);

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith('confirmed');
      });
    });
  });

  describe('Time Calculations', () => {
    it('should show remaining time correctly', async () => {
      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/~\d+m remaining/)).toBeTruthy();
      });
    });

    it('should show "Completing soon" when estimated time has passed', async () => {
      const pastTransaction = {
        ...mockTransaction,
        estimatedCompletion: new Date(Date.now() - 5 * 60000).toISOString() // 5 minutes ago
      };
      mockGetTransactionStatus.mockResolvedValue(pastTransaction);

      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Completing soon...')).toBeTruthy();
      });
    });

    it('should format time correctly for hours', async () => {
      const longTransaction = {
        ...mockTransaction,
        estimatedCompletion: new Date(Date.now() + 90 * 60000).toISOString() // 90 minutes from now
      };
      mockGetTransactionStatus.mockResolvedValue(longTransaction);

      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/~1h 30m remaining/)).toBeTruthy();
      });
    });
  });

  describe('Refresh Functionality', () => {
    it('should refresh transaction status on button press', async () => {
      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('CONFIRMING')).toBeTruthy();
      });

      const refreshButton = screen.getByText('Refresh');
      fireEvent.press(refreshButton);

      expect(mockGetTransactionStatus).toHaveBeenCalledTimes(2); // Initial load + refresh
    });

    it('should show refreshing state during refresh', async () => {
      mockGetTransactionStatus.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockTransaction), 100))
      );

      render(<TransactionStatusMonitor {...defaultProps} />);

      const refreshButton = screen.getByText('Refresh');
      fireEvent.press(refreshButton);

      expect(screen.getByText('Refreshing...')).toBeTruthy();
    });
  });

  describe('Transaction Acceleration', () => {
    it('should show acceleration button for pending transactions', async () => {
      const pendingTransaction = {
        ...mockTransaction,
        status: 'pending'
      };
      mockGetTransactionStatus.mockResolvedValue(pendingTransaction);

      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('⚡ Accelerate')).toBeTruthy();
      });
    });

    it('should not show acceleration button for confirmed transactions', async () => {
      const confirmedTransaction = {
        ...mockTransaction,
        status: 'confirmed'
      };
      mockGetTransactionStatus.mockResolvedValue(confirmedTransaction);

      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText('⚡ Accelerate')).toBeNull();
      });
    });

    it('should handle acceleration button press', async () => {
      const pendingTransaction = {
        ...mockTransaction,
        status: 'pending'
      };
      mockGetTransactionStatus.mockResolvedValue(pendingTransaction);
      mockAccelerateTransaction.mockResolvedValue([
        {
          accelerationId: 'accel-1',
          feeIncrease: 1250,
          estimatedSpeedup: 15,
          available: true
        }
      ]);

      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('⚡ Accelerate')).toBeTruthy();
      });

      const accelerateButton = screen.getByText('⚡ Accelerate');
      fireEvent.press(accelerateButton);

      await waitFor(() => {
        expect(mockAccelerateTransaction).toHaveBeenCalledWith('test-tx-123', 'test-card-456');
        expect(screen.getByText('Acceleration Options:')).toBeTruthy();
        expect(screen.getByText('+$12.50 fee')).toBeTruthy();
        expect(screen.getByText('~15min faster')).toBeTruthy();
      });
    });
  });

  describe('Status Messages', () => {
    it('should show failure message for failed transactions', async () => {
      const failedTransaction = {
        ...mockTransaction,
        status: 'failed'
      };
      mockGetTransactionStatus.mockResolvedValue(failedTransaction);

      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Transaction failed. A refund will be processed automatically./)).toBeTruthy();
      });
    });

    it('should show refund message for refunded transactions', async () => {
      const refundedTransaction = {
        ...mockTransaction,
        status: 'refunded'
      };
      mockGetTransactionStatus.mockResolvedValue(refundedTransaction);

      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Transaction has been refunded./)).toBeTruthy();
      });
    });
  });

  describe('Callbacks', () => {
    it('should call onTransactionCompleted when transaction is confirmed', async () => {
      const onTransactionCompleted = jest.fn();

      render(
        <TransactionStatusMonitor 
          {...defaultProps} 
          onTransactionCompleted={onTransactionCompleted}
        />
      );

      // Simulate receiving a confirmed transaction update
      const confirmedTransaction = {
        ...mockTransaction,
        status: 'confirmed',
        confirmationCount: 3,
        completedAt: new Date().toISOString()
      };

      // Update the mock to return confirmed transaction
      mockGetTransactionStatus.mockResolvedValue(confirmedTransaction);

      // Trigger re-render with new data
      const { rerender } = render(
        <TransactionStatusMonitor 
          {...defaultProps} 
          onTransactionCompleted={onTransactionCompleted}
        />
      );

      await waitFor(() => {
        expect(onTransactionCompleted).toHaveBeenCalled();
      });
    });

    it('should call onStatusChange when status updates', async () => {
      const onStatusChange = jest.fn();

      render(
        <TransactionStatusMonitor 
          {...defaultProps} 
          onStatusChange={onStatusChange}
        />
      );

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith('confirming');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket message parsing errors gracefully', async () => {
      const errorWebSocket = {
        ...mockWebSocket,
        lastMessage: 'invalid-json'
      };
      (useWebSocketConnection as jest.Mock).mockReturnValue(errorWebSocket);

      // Should not crash
      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('CONFIRMING')).toBeTruthy();
      });
    });

    it('should handle transaction loading errors', async () => {
      mockGetTransactionStatus.mockRejectedValue(new Error('Failed to load transaction'));

      // Should show loading state and not crash
      render(<TransactionStatusMonitor {...defaultProps} />);

      expect(screen.getByText('Loading transaction status...')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility features', async () => {
      render(<TransactionStatusMonitor {...defaultProps} />);

      await waitFor(() => {
        // Progress bar should be accessible
        const progressText = screen.getByText('67%');
        expect(progressText).toBeTruthy();

        // Status should be clearly indicated
        expect(screen.getByText('CONFIRMING')).toBeTruthy();
      });
    });
  });
});