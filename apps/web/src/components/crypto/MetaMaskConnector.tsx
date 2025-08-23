'use client';

/**
 * MetaMask Connector Component for Web
 * Handles MetaMask browser extension integration
 */

import React, { useState, useEffect } from 'react';
import {
  CryptoWallet,
  MetaMaskConnectionRequest,
  CryptoWalletError,
  CRYPTO_ERROR_CODES,
} from '@discard/shared';

interface MetaMaskConnectorProps {
  // eslint-disable-next-line no-unused-vars
  onWalletConnected?: (wallet: CryptoWallet) => void;
  // eslint-disable-next-line no-unused-vars
  onWalletDisconnected?: (walletId: string) => void;
  // eslint-disable-next-line no-unused-vars
  onError?: (error: CryptoWalletError) => void;
  className?: string;
}

interface MetaMaskProvider {
  isMetaMask: boolean;
  // eslint-disable-next-line no-unused-vars
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  // eslint-disable-next-line no-unused-vars
  on: (event: string, handler: (args: any) => void) => void;
  // eslint-disable-next-line no-unused-vars
  removeListener: (event: string, handler: (args: any) => void) => void;
  selectedAddress: string | null;
  chainId: string;
}

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    ethereum?: MetaMaskProvider;
  }
}

const MetaMaskConnector: React.FC<MetaMaskConnectorProps> = ({
  onWalletConnected,
  onWalletDisconnected,
  onError,
  className = '',
}) => {
  // State management
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<CryptoWallet | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkMetaMaskInstallation();
    checkExistingConnection();
    setupEventListeners();

    return () => {
      removeEventListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAuthToken = async (): Promise<string> => {
    // This would integrate with your auth system
    // For now, returning a placeholder
    return 'mock-token';
  };

  const checkMetaMaskInstallation = () => {
    const isInstalled = typeof window !== 'undefined' && 
                       typeof window.ethereum !== 'undefined' && 
                       window.ethereum.isMetaMask;
    
    setIsMetaMaskInstalled(isInstalled);
    
    if (isInstalled && window.ethereum) {
      setChainId(window.ethereum.chainId);
    }
  };

  const checkExistingConnection = async () => {
    if (!isMetaMaskInstalled || !window.ethereum) return;

    try {
      // Check if already connected
      const accounts = await window.ethereum.request({ 
        method: 'eth_accounts' 
      });
      
      if (accounts.length > 0) {
        setConnectedAccount(accounts[0]);
        await loadConnectedWallet(accounts[0]);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error checking existing connection:', error);
    }
  };

  const loadConnectedWallet = async (address: string) => {
    try {
      const response = await fetch('/api/v1/crypto/wallets', {
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const metamaskWallet = data.data.wallets.find(
          (wallet: CryptoWallet) => 
            wallet.walletType === 'metamask' && 
            wallet.walletAddress === address
        );
        
        if (metamaskWallet) {
          setConnectedWallet(metamaskWallet);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load connected wallet:', error);
    }
  };

  const setupEventListeners = () => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected
        handleDisconnection();
      } else {
        // User switched accounts
        setConnectedAccount(accounts[0]);
        loadConnectedWallet(accounts[0]);
      }
    };

    const handleChainChanged = (chainId: string) => {
      setChainId(chainId);
      // Reload the page as recommended by MetaMask
      window.location.reload();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
  };

  const removeEventListeners = () => {
    if (!window.ethereum) return;

    window.ethereum.removeListener('accountsChanged', () => {});
    window.ethereum.removeListener('chainChanged', () => {});
  };

  const connectMetaMask = async () => {
    if (!isMetaMaskInstalled || !window.ethereum) {
      const error: CryptoWalletError = {
        code: CRYPTO_ERROR_CODES.METAMASK_NOT_DETECTED,
        message: 'MetaMask is not installed. Please install MetaMask to continue.',
      };
      setError(error.message);
      onError?.(error);
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No accounts returned from MetaMask');
      }

      const account = accounts[0];
      setConnectedAccount(account);

      // Connect to backend
      const connectionRequest: MetaMaskConnectionRequest = {
        requestedPermissions: ['eth_accounts', 'eth_sendTransaction'],
        sessionDuration: 3600, // 1 hour
      };

      const response = await fetch('/api/v1/crypto/metamask/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({
          ...connectionRequest,
          walletAddress: account,
          chainId: window.ethereum.chainId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect MetaMask wallet');
      }

      const data = await response.json();
      const wallet = data.data.wallet;
      
      setConnectedWallet(wallet);
      onWalletConnected?.(wallet);

    } catch (error) {
      const walletError: CryptoWalletError = {
        code: CRYPTO_ERROR_CODES.WALLET_CONNECTION_FAILED,
        message: error instanceof Error ? error.message : 'Failed to connect MetaMask',
        details: { provider: 'metamask' },
      };
      
      setError(walletError.message);
      onError?.(walletError);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    if (!connectedWallet) return;

    try {
      const response = await fetch(`/api/v1/crypto/wallets/${connectedWallet.walletId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });

      if (response.ok) {
        handleDisconnection();
        onWalletDisconnected?.(connectedWallet.walletId);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to disconnect wallet');
      }
    } catch (error) {
      const walletError: CryptoWalletError = {
        code: CRYPTO_ERROR_CODES.WALLET_DISCONNECTION_FAILED,
        message: error instanceof Error ? error.message : 'Failed to disconnect wallet',
      };
      
      setError(walletError.message);
      onError?.(walletError);
    }
  };

  const handleDisconnection = () => {
    setConnectedAccount(null);
    setConnectedWallet(null);
  };

  const switchToEthereum = async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1' }], // Ethereum Mainnet
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to switch to Ethereum mainnet:', error);
    }
  };

  const getChainName = (chainId: string): string => {
    const chains: Record<string, string> = {
      '0x1': 'Ethereum Mainnet',
      '0x5': 'Goerli Testnet',
      '0x11155111': 'Sepolia Testnet',
      '0x89': 'Polygon Mainnet',
      '0x13881': 'Polygon Mumbai',
    };
    
    return chains[chainId] || 'Unknown Network';
  };

  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!isMetaMaskInstalled) {
    return (
      <div className={`bg-orange-50 border border-orange-200 rounded-lg p-6 ${className}`}>
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="text-2xl">🦊</div>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-orange-800">
              MetaMask Not Detected
            </h3>
            <p className="text-sm text-orange-700 mt-1">
              Please install MetaMask browser extension to connect your Ethereum wallet.
            </p>
            <div className="mt-3">
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
              >
                Install MetaMask
                <svg className="ml-1 -mr-0.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <div className="text-2xl mr-3">🦊</div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">MetaMask</h3>
            <p className="text-sm text-gray-500">
              Connect your MetaMask browser extension
            </p>
          </div>
        </div>
        
        {chainId && (
          <div className="text-right">
            <div className="text-xs text-gray-500">Network</div>
            <div className="text-sm font-medium text-gray-900">
              {getChainName(chainId)}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-red-800">Connection Error</h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 text-xs text-red-600 hover:text-red-500 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {connectedAccount && connectedWallet ? (
        <div className="space-y-4">
          {/* Connected Account Info */}
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-green-800">Connected</h4>
                <p className="text-sm text-green-700 font-mono">
                  {formatAddress(connectedAccount)}
                </p>
                {connectedWallet.walletName && (
                  <p className="text-xs text-green-600 mt-1">
                    {connectedWallet.walletName}
                  </p>
                )}
              </div>
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${
                  connectedWallet.connectionStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'
                }`} />
                <span className="text-xs text-green-700 capitalize">
                  {connectedWallet.connectionStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Wallet Actions */}
          <div className="flex space-x-3">
            <button
              onClick={switchToEthereum}
              className="flex-1 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 border border-indigo-300 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Switch to Ethereum
            </button>
            <button
              onClick={disconnectWallet}
              className="flex-1 px-4 py-2 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-md hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Disconnect
            </button>
          </div>

          {/* Session Info */}
          <div className="text-xs text-gray-500 space-y-1">
            <div>Session expires: {new Date(connectedWallet.sessionExpiry).toLocaleString()}</div>
            <div>Last updated: {new Date(connectedWallet.lastBalanceCheck).toLocaleString()}</div>
            <div>Permissions: {connectedWallet.permissions.join(', ')}</div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            onClick={connectMetaMask}
            disabled={isConnecting}
            className="w-full flex justify-center items-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Connecting...
              </>
            ) : (
              'Connect MetaMask'
            )}
          </button>

          <div className="text-xs text-gray-500 space-y-1">
            <p>• Connect your MetaMask wallet to fund cards with Ethereum and ERC-20 tokens</p>
            <p>• Supports transaction signing and smart contract interactions</p>
            <p>• Your wallet remains secure - we never access your private keys</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetaMaskConnector;