import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import WalletConnectComponent from '../../../src/components/crypto/WalletConnectComponent';
import useCrypto from '../../../src/stores/crypto';

// Mock the crypto store
jest.mock('../../../src/stores/crypto');
const mockUseCrypto = useCrypto as jest.MockedFunction<typeof useCrypto>;

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock QR Code Scanner (assuming you use react-native-qrcode-scanner or similar)
jest.mock('react-native-qrcode-scanner', () => {
  return jest.fn().mockImplementation(({ onRead, showMarker }) => {
    const MockedQRCodeScanner = () => {
      React.useEffect(() => {
        // Simulate QR code scan after mount
        setTimeout(() => {
          if (onRead) {
            onRead({ data: 'wc:test-uri@1?bridge=test&key=test' });
          }
        }, 100);
      }, []);
      
      return null;
    };
    return MockedQRCodeScanner;
  });
});

// Mock Modal component
jest.mock('react-native/Libraries/Modal/Modal', () => 'Modal');

// Mock fetch for API calls
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('WalletConnectComponent', () => {
  const mockCryptoStore = {
    connectedWallets: [],
    isConnecting: false,
    error: null,
    connectWallet: jest.fn(),
    setError: jest.fn(),
    clearAllErrors: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCrypto.mockReturnValue(mockCryptoStore as any);
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Component Rendering', () => {
    it('should render connect button when no wallets connected', () => {
      render(<WalletConnectComponent />);
      
      expect(screen.getByText('Connect Wallet')).toBeTruthy();
      expect(screen.getByText('Connect your wallet using WalletConnect')).toBeTruthy();
    });

    it('should show loading state when connecting', () => {
      mockUseCrypto.mockReturnValue({
        ...mockCryptoStore,
        isConnecting: true
      } as any);

      render(<WalletConnectComponent />);
      
      expect(screen.getByText('Connecting...')).toBeTruthy();
    });

    it('should display error message when error exists', () => {
      const errorMessage = 'Failed to connect wallet';
      mockUseCrypto.mockReturnValue({
        ...mockCryptoStore,
        error: errorMessage
      } as any);

      render(<WalletConnectComponent />);
      
      expect(screen.getByText(errorMessage)).toBeTruthy();
    });

    it('should show connected wallets when available', () => {
      const mockWallets = [
        {
          walletId: 'wallet-1',
          walletType: 'walletconnect',
          walletName: 'Test Wallet',
          walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
          connectionStatus: 'connected'
        }
      ];

      mockUseCrypto.mockReturnValue({
        ...mockCryptoStore,
        connectedWallets: mockWallets
      } as any);

      render(<WalletConnectComponent />);
      
      expect(screen.getByText('Test Wallet')).toBeTruthy();
      expect(screen.getByText('0x742d...5e1dca')).toBeTruthy();
    });
  });

  describe('WalletConnect Flow', () => {
    it('should open QR code modal when connect button is pressed', () => {
      render(<WalletConnectComponent />);
      
      const connectButton = screen.getByText('Connect Wallet');
      fireEvent.press(connectButton);
      
      expect(screen.getByTestId('qr-modal')).toBeTruthy();
    });

    it('should generate session proposal and show QR code', async () => {
      // Mock successful session proposal
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            uri: 'wc:test-uri@1?bridge=test&key=test',
            proposalId: 'test-proposal-id'
          }
        })
      });

      render(<WalletConnectComponent />);
      
      const connectButton = screen.getByText('Connect Wallet');
      fireEvent.press(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText('Scan QR Code')).toBeTruthy();
      });
    });

    it('should handle QR code scan and wallet connection', async () => {
      const mockWallet = {
        walletId: 'new-wallet-id',
        walletType: 'walletconnect',
        walletName: 'Scanned Wallet',
        walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
        connectionStatus: 'connected'
      };

      mockCryptoStore.connectWallet.mockResolvedValue(mockWallet);

      render(<WalletConnectComponent />);
      
      const connectButton = screen.getByText('Connect Wallet');
      fireEvent.press(connectButton);
      
      // Wait for QR scan simulation
      await waitFor(() => {
        expect(mockCryptoStore.connectWallet).toHaveBeenCalledWith(
          'walletconnect',
          expect.objectContaining({
            uri: 'wc:test-uri@1?bridge=test&key=test'
          })
        );
      }, { timeout: 200 });
    });

    it('should close modal on successful connection', async () => {
      const mockWallet = {
        walletId: 'new-wallet-id',
        walletType: 'walletconnect',
        walletName: 'Connected Wallet',
        walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
        connectionStatus: 'connected'
      };

      mockCryptoStore.connectWallet.mockResolvedValue(mockWallet);

      render(<WalletConnectComponent />);
      
      const connectButton = screen.getByText('Connect Wallet');
      fireEvent.press(connectButton);
      
      await waitFor(() => {
        expect(screen.queryByTestId('qr-modal')).toBeFalsy();
      }, { timeout: 300 });
    });

    it('should handle connection errors gracefully', async () => {
      mockCryptoStore.connectWallet.mockRejectedValue(new Error('Connection failed'));

      render(<WalletConnectComponent />);
      
      const connectButton = screen.getByText('Connect Wallet');
      fireEvent.press(connectButton);
      
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Connection Error',
          'Failed to connect wallet. Please try again.',
          [{ text: 'OK' }]
        );
      }, { timeout: 200 });
    });
  });

  describe('Session Management', () => {
    it('should display session expiry information', () => {
      const mockWallets = [
        {
          walletId: 'wallet-1',
          walletType: 'walletconnect',
          walletName: 'Test Wallet',
          walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
          connectionStatus: 'connected',
          sessionExpiry: new Date(Date.now() + 3600000) // 1 hour from now
        }
      ];

      mockUseCrypto.mockReturnValue({
        ...mockCryptoStore,
        connectedWallets: mockWallets
      } as any);

      render(<WalletConnectComponent />);
      
      expect(screen.getByText(/expires in/i)).toBeTruthy();
    });

    it('should show warning for sessions expiring soon', () => {
      const mockWallets = [
        {
          walletId: 'wallet-1',
          walletType: 'walletconnect',
          walletName: 'Test Wallet',
          walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
          connectionStatus: 'connected',
          sessionExpiry: new Date(Date.now() + 300000) // 5 minutes from now
        }
      ];

      mockUseCrypto.mockReturnValue({
        ...mockCryptoStore,
        connectedWallets: mockWallets
      } as any);

      render(<WalletConnectComponent />);
      
      expect(screen.getByText(/expiring soon/i)).toBeTruthy();
    });
  });

  describe('Wallet Actions', () => {
    it('should disconnect wallet when disconnect button is pressed', async () => {
      const mockWallets = [
        {
          walletId: 'wallet-1',
          walletType: 'walletconnect',
          walletName: 'Test Wallet',
          walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
          connectionStatus: 'connected'
        }
      ];

      const mockDisconnectWallet = jest.fn().mockResolvedValue(true);
      mockUseCrypto.mockReturnValue({
        ...mockCryptoStore,
        connectedWallets: mockWallets,
        disconnectWallet: mockDisconnectWallet
      } as any);

      render(<WalletConnectComponent />);
      
      const disconnectButton = screen.getByText('Disconnect');
      fireEvent.press(disconnectButton);
      
      expect(Alert.alert).toHaveBeenCalledWith(
        'Disconnect Wallet',
        'Are you sure you want to disconnect Test Wallet?',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel' }),
          expect.objectContaining({ text: 'Disconnect' })
        ])
      );
    });

    it('should show wallet details when wallet item is pressed', () => {
      const mockWallets = [
        {
          walletId: 'wallet-1',
          walletType: 'walletconnect',
          walletName: 'Test Wallet',
          walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
          connectionStatus: 'connected',
          permissions: ['eth_accounts', 'personal_sign']
        }
      ];

      mockUseCrypto.mockReturnValue({
        ...mockCryptoStore,
        connectedWallets: mockWallets
      } as any);

      render(<WalletConnectComponent />);
      
      const walletItem = screen.getByText('Test Wallet');
      fireEvent.press(walletItem);
      
      expect(screen.getByText('Wallet Details')).toBeTruthy();
      expect(screen.getByText('eth_accounts')).toBeTruthy();
      expect(screen.getByText('personal_sign')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should clear errors when component unmounts', () => {
      const { unmount } = render(<WalletConnectComponent />);
      
      unmount();
      
      expect(mockCryptoStore.clearAllErrors).toHaveBeenCalled();
    });

    it('should handle invalid QR code data', async () => {
      // Mock QR scanner with invalid data
      jest.doMock('react-native-qrcode-scanner', () => {
        return jest.fn().mockImplementation(({ onRead }) => {
          React.useEffect(() => {
            setTimeout(() => {
              if (onRead) {
                onRead({ data: 'invalid-qr-data' });
              }
            }, 100);
          }, []);
          return null;
        });
      });

      render(<WalletConnectComponent />);
      
      const connectButton = screen.getByText('Connect Wallet');
      fireEvent.press(connectButton);
      
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Invalid QR Code',
          'Please scan a valid WalletConnect QR code.',
          [{ text: 'OK' }]
        );
      }, { timeout: 200 });
    });

    it('should handle network errors during connection', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<WalletConnectComponent />);
      
      const connectButton = screen.getByText('Connect Wallet');
      fireEvent.press(connectButton);
      
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Network Error',
          'Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels', () => {
      render(<WalletConnectComponent />);
      
      const connectButton = screen.getByLabelText('Connect wallet using WalletConnect');
      expect(connectButton).toBeTruthy();
    });

    it('should support screen readers', () => {
      const mockWallets = [
        {
          walletId: 'wallet-1',
          walletType: 'walletconnect',
          walletName: 'Test Wallet',
          walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
          connectionStatus: 'connected'
        }
      ];

      mockUseCrypto.mockReturnValue({
        ...mockCryptoStore,
        connectedWallets: mockWallets
      } as any);

      render(<WalletConnectComponent />);
      
      expect(screen.getByLabelText('Connected wallet: Test Wallet')).toBeTruthy();
    });
  });
});