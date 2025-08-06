import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MetaMaskConnector from '../../../src/components/crypto/MetaMaskConnector';

// Mock window.ethereum (MetaMask provider)
const mockEthereum = {
  isMetaMask: true,
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  selectedAddress: null,
  chainId: '0x1',
  networkVersion: '1'
};

// Mock fetch for API calls
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('MetaMaskConnector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup window.ethereum mock
    Object.defineProperty(window, 'ethereum', {
      value: mockEthereum,
      writable: true
    });
    
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    // Clean up window.ethereum
    delete (window as any).ethereum;
  });

  describe('MetaMask Detection', () => {
    it('should detect MetaMask when available', () => {
      render(<MetaMaskConnector />);
      
      expect(screen.getByText('Connect MetaMask')).toBeInTheDocument();
      expect(screen.queryByText('MetaMask not detected')).not.toBeInTheDocument();
    });

    it('should show install message when MetaMask is not available', () => {
      delete (window as any).ethereum;
      
      render(<MetaMaskConnector />);
      
      expect(screen.getByText('MetaMask not detected')).toBeInTheDocument();
      expect(screen.getByText('Install MetaMask')).toBeInTheDocument();
    });

    it('should detect non-MetaMask providers', () => {
      Object.defineProperty(window, 'ethereum', {
        value: { ...mockEthereum, isMetaMask: false },
        writable: true
      });
      
      render(<MetaMaskConnector />);
      
      expect(screen.getByText('Please use MetaMask')).toBeInTheDocument();
    });

    it('should handle multiple providers correctly', () => {
      const mockProviders = [
        { isMetaMask: false, isCoinbaseWallet: true },
        { isMetaMask: true }
      ];
      
      Object.defineProperty(window, 'ethereum', {
        value: { 
          providers: mockProviders,
          request: mockEthereum.request,
          on: mockEthereum.on
        },
        writable: true
      });
      
      render(<MetaMaskConnector />);
      
      expect(screen.getByText('Connect MetaMask')).toBeInTheDocument();
    });
  });

  describe('Connection Flow', () => {
    it('should connect to MetaMask successfully', async () => {
      const mockAccounts = ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'];
      const mockChainId = '0x1';
      
      mockEthereum.request
        .mockResolvedValueOnce(mockAccounts) // eth_requestAccounts
        .mockResolvedValueOnce(mockChainId); // eth_chainId

      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            connectionId: 'test-connection-id',
            accounts: mockAccounts,
            chainId: mockChainId,
            isConnected: true
          }
        })
      });

      render(<MetaMaskConnector />);
      
      const connectButton = screen.getByText('Connect MetaMask');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      
      expect(screen.getByText('0x742d...5e1dca')).toBeInTheDocument();
      expect(screen.getByText('Ethereum Mainnet')).toBeInTheDocument();
    });

    it('should handle user rejection', async () => {
      mockEthereum.request.mockRejectedValueOnce({
        code: 4001,
        message: 'User rejected the request.'
      });

      render(<MetaMaskConnector />);
      
      const connectButton = screen.getByText('Connect MetaMask');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText('Connection cancelled')).toBeInTheDocument();
      });
    });

    it('should handle connection errors', async () => {
      mockEthereum.request.mockRejectedValueOnce(new Error('Connection failed'));

      render(<MetaMaskConnector />);
      
      const connectButton = screen.getByText('Connect MetaMask');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeInTheDocument();
      });
    });

    it('should show loading state during connection', () => {
      mockEthereum.request.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      render(<MetaMaskConnector />);
      
      const connectButton = screen.getByText('Connect MetaMask');
      fireEvent.click(connectButton);
      
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
      expect(connectButton).toBeDisabled();
    });
  });

  describe('Connected State', () => {
    const mockConnectedState = {
      connectionId: 'test-connection-id',
      accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
      chainId: '0x1',
      isConnected: true,
      permissions: ['eth_accounts']
    };

    beforeEach(() => {
      // Mock initial connection check
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { connections: [mockConnectedState] }
        })
      });
    });

    it('should display connected account information', async () => {
      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      
      expect(screen.getByText('0x742d...5e1dca')).toBeInTheDocument();
      expect(screen.getByText('Ethereum Mainnet')).toBeInTheDocument();
    });

    it('should show account balance when available', async () => {
      mockEthereum.request.mockResolvedValueOnce('0x1bc16d674ec80000'); // 2 ETH

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      
      expect(screen.getByText('2.0 ETH')).toBeInTheDocument();
    });

    it('should allow disconnection', async () => {
      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      
      // Mock successful disconnection
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });
      
      const disconnectButton = screen.getByText('Disconnect');
      fireEvent.click(disconnectButton);
      
      await waitFor(() => {
        expect(screen.getByText('Connect MetaMask')).toBeInTheDocument();
      });
    });
  });

  describe('Network Management', () => {
    it('should display current network', async () => {
      mockEthereum.chainId = '0x89'; // Polygon
      
      render(<MetaMaskConnector />);
      
      expect(screen.getByText('Polygon')).toBeInTheDocument();
    });

    it('should handle network switching', async () => {
      const mockConnectedState = {
        connectionId: 'test-connection-id',
        accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
        chainId: '0x1',
        isConnected: true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { connections: [mockConnectedState] }
        })
      });

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      
      const networkSelector = screen.getByTestId('network-selector');
      fireEvent.change(networkSelector, { target: { value: '0x89' } });
      
      expect(mockEthereum.request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }]
      });
    });

    it('should handle unsupported networks', async () => {
      mockEthereum.chainId = '0x999'; // Unknown network
      
      render(<MetaMaskConnector />);
      
      expect(screen.getByText('Unknown Network')).toBeInTheDocument();
      expect(screen.getByText('Switch to supported network')).toBeInTheDocument();
    });

    it('should handle network switching errors', async () => {
      const mockConnectedState = {
        connectionId: 'test-connection-id',
        accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
        chainId: '0x1',
        isConnected: true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { connections: [mockConnectedState] }
        })
      });

      mockEthereum.request.mockRejectedValueOnce({
        code: 4902,
        message: 'Unrecognized chain ID'
      });

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      
      const networkSelector = screen.getByTestId('network-selector');
      fireEvent.change(networkSelector, { target: { value: '0x89' } });
      
      await waitFor(() => {
        expect(screen.getByText('Network switch failed')).toBeInTheDocument();
      });
    });
  });

  describe('Account Management', () => {
    it('should handle account changes', async () => {
      const mockConnectedState = {
        connectionId: 'test-connection-id',
        accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
        chainId: '0x1',
        isConnected: true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { connections: [mockConnectedState] }
        })
      });

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('0x742d...5e1dca')).toBeInTheDocument();
      });
      
      // Simulate account change event
      const accountChangeHandler = mockEthereum.on.mock.calls.find(
        call => call[0] === 'accountsChanged'
      )?.[1];
      
      if (accountChangeHandler) {
        accountChangeHandler(['0x1234567890abcdef1234567890abcdef12345678']);
        
        await waitFor(() => {
          expect(screen.getByText('0x1234...5678')).toBeInTheDocument();
        });
      }
    });

    it('should handle account disconnection', async () => {
      const mockConnectedState = {
        connectionId: 'test-connection-id',
        accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
        chainId: '0x1',
        isConnected: true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { connections: [mockConnectedState] }
        })
      });

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      
      // Simulate account disconnection
      const accountChangeHandler = mockEthereum.on.mock.calls.find(
        call => call[0] === 'accountsChanged'
      )?.[1];
      
      if (accountChangeHandler) {
        accountChangeHandler([]);
        
        await waitFor(() => {
          expect(screen.getByText('Connect MetaMask')).toBeInTheDocument();
        });
      }
    });

    it('should support multiple accounts', async () => {
      const mockConnectedState = {
        connectionId: 'test-connection-id',
        accounts: [
          '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
          '0x1234567890abcdef1234567890abcdef12345678'
        ],
        chainId: '0x1',
        isConnected: true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { connections: [mockConnectedState] }
        })
      });

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      
      expect(screen.getByText('2 accounts connected')).toBeInTheDocument();
      expect(screen.getByText('0x742d...5e1dca')).toBeInTheDocument();
    });
  });

  describe('Permissions Management', () => {
    it('should display current permissions', async () => {
      const mockConnectedState = {
        connectionId: 'test-connection-id',
        accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
        chainId: '0x1',
        isConnected: true,
        permissions: ['eth_accounts', 'personal_sign', 'eth_sendTransaction']
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { connections: [mockConnectedState] }
        })
      });

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Accounts')).toBeInTheDocument();
      expect(screen.getByText('Signing')).toBeInTheDocument();
      expect(screen.getByText('Transactions')).toBeInTheDocument();
    });

    it('should request additional permissions', async () => {
      const mockConnectedState = {
        connectionId: 'test-connection-id',
        accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
        chainId: '0x1',
        isConnected: true,
        permissions: ['eth_accounts']
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { connections: [mockConnectedState] }
        })
      });

      mockEthereum.request.mockResolvedValueOnce([
        { caveats: [{ value: { 'personal_sign': {} } }] }
      ]);

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      
      const requestPermButton = screen.getByText('Request Signing Permission');
      fireEvent.click(requestPermButton);
      
      expect(mockEthereum.request).toHaveBeenCalledWith({
        method: 'wallet_requestPermissions',
        params: [{ 'personal_sign': {} }]
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load connection status')).toBeInTheDocument();
      });
    });

    it('should handle MetaMask errors', async () => {
      mockEthereum.request.mockRejectedValueOnce({
        code: -32603,
        message: 'Internal JSON-RPC error'
      });

      render(<MetaMaskConnector />);
      
      const connectButton = screen.getByText('Connect MetaMask');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText('MetaMask error occurred')).toBeInTheDocument();
      });
    });

    it('should provide retry functionality', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { connections: [] }
        })
      });
      
      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);
      
      await waitFor(() => {
        expect(screen.getByText('Connect MetaMask')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels', () => {
      render(<MetaMaskConnector />);
      
      expect(screen.getByLabelText('Connect to MetaMask wallet')).toBeInTheDocument();
    });

    it('should support keyboard navigation', () => {
      render(<MetaMaskConnector />);
      
      const connectButton = screen.getByText('Connect MetaMask');
      connectButton.focus();
      
      expect(connectButton).toHaveFocus();
    });

    it('should announce connection status to screen readers', async () => {
      const mockConnectedState = {
        connectionId: 'test-connection-id',
        accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
        chainId: '0x1',
        isConnected: true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { connections: [mockConnectedState] }
        })
      });

      render(<MetaMaskConnector />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('MetaMask connected to account 0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca')).toBeInTheDocument();
      });
    });
  });

  describe('Performance', () => {
    it('should debounce rapid connection attempts', () => {
      jest.useFakeTimers();
      
      render(<MetaMaskConnector />);
      
      const connectButton = screen.getByText('Connect MetaMask');
      
      // Rapid clicks
      fireEvent.click(connectButton);
      fireEvent.click(connectButton);
      fireEvent.click(connectButton);
      
      jest.advanceTimersByTime(1000);
      
      // Should only call request once
      expect(mockEthereum.request).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });

    it('should cleanup event listeners on unmount', () => {
      const { unmount } = render(<MetaMaskConnector />);
      
      unmount();
      
      expect(mockEthereum.removeListener).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
      expect(mockEthereum.removeListener).toHaveBeenCalledWith('chainChanged', expect.any(Function));
    });
  });

  describe('Security', () => {
    it('should validate account addresses', async () => {
      const invalidAccounts = ['invalid-address'];
      
      mockEthereum.request.mockResolvedValueOnce(invalidAccounts);

      render(<MetaMaskConnector />);
      
      const connectButton = screen.getByText('Connect MetaMask');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText('Invalid account address received')).toBeInTheDocument();
      });
    });

    it('should handle suspicious chain IDs', async () => {
      mockEthereum.chainId = '0x99999'; // Suspicious chain ID
      
      render(<MetaMaskConnector />);
      
      expect(screen.getByText('Unsupported network')).toBeInTheDocument();
      expect(screen.getByText('Please switch to a supported network')).toBeInTheDocument();
    });
  });
});