/**
 * MoonPay React Native SDK Hook
 *
 * Wraps the official MoonPay SDK with Convex URL signing.
 * Provides buy and sell flows for crypto on/off-ramp.
 *
 * PRIVACY FEATURE: For Solana deposits, uses single-use deposit addresses
 * to break the link between MoonPay KYC and user's spending wallet.
 */
import { useCallback, useEffect, useState, useRef } from 'react';
import { useMoonPaySdk } from '@moonpay/react-native-moonpay-sdk';
import { useAction, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import * as WebBrowser from 'expo-web-browser';
import { emitRefreshEvent } from '@/hooks/useRefreshStrategy';

// Get environment config
const MOONPAY_API_KEY = process.env.EXPO_PUBLIC_MOONPAY_API_KEY || '';
const MOONPAY_ENVIRONMENT = (process.env.EXPO_PUBLIC_MOONPAY_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

// Currencies that use Solana addresses (suffix _sol or 'sol')
const SOLANA_CURRENCIES = ['sol', 'usdc_sol', 'usdt_sol', 'bonk_sol'];

/**
 * Check if currency uses Solana network
 */
function isSolanaCurrency(currencyCode: string): boolean {
  return SOLANA_CURRENCIES.includes(currencyCode.toLowerCase()) || currencyCode.toLowerCase() === 'sol';
}

// Helper to determine which wallet address to use
function getWalletAddressForCurrency(
  currencyCode: string,
  solanaAddress?: string | null,
  ethereumAddress?: string | null
): string | undefined {
  const isSolana = SOLANA_CURRENCIES.includes(currencyCode.toLowerCase()) || currencyCode.toLowerCase() === 'sol';
  if (isSolana) {
    return solanaAddress || undefined;
  }
  return ethereumAddress || undefined;
}

interface UseMoonPayOptions {
  // Legacy single address (backwards compatible)
  walletAddress?: string | null;
  // Multi-chain support
  solanaAddress?: string | null;
  ethereumAddress?: string | null;
  defaultCurrency?: string;
  /**
   * Use single-use privacy addresses for deposits (Solana only).
   * When enabled, creates a fresh deposit address that auto-shields
   * to Privacy Cash pool, breaking the KYC → wallet link.
   * Default: true
   */
  usePrivacyAddress?: boolean;
}

interface UseMoonPayReturn {
  // Buy flow
  openBuy: (options?: { currencyCode?: string; baseCurrencyAmount?: number }) => Promise<void>;
  // Sell flow
  openSell: (options?: { currencyCode?: string; quoteCurrencyAmount?: number }) => Promise<void>;
  // WebView component (for embedded use)
  MoonPayBuyWebView: React.ComponentType | null;
  MoonPaySellWebView: React.ComponentType | null;
  // State
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  /** ID of the last initiated transaction (for tracking) */
  lastTransactionId: Id<"moonpayTransactions"> | null;
}

/**
 * Hook for MoonPay buy/sell flows
 */
export function useMoonPay(options: UseMoonPayOptions = {}): UseMoonPayReturn {
  const {
    walletAddress,
    solanaAddress,
    ethereumAddress,
    defaultCurrency = 'eth',
    usePrivacyAddress = true,
  } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache for single-use deposit address (reused within session if not expired)
  const privacyAddressCache = useRef<{ address: string; expiresAt: number } | null>(null);

  // Track the last initiated transaction ID
  const lastTransactionIdRef = useRef<Id<"moonpayTransactions"> | null>(null);
  const [lastTransactionId, setLastTransactionId] = useState<Id<"moonpayTransactions"> | null>(null);

  // Determine which wallet address to use based on currency
  // If legacy walletAddress is provided, use it; otherwise determine from currency
  const effectiveWalletAddress = walletAddress || getWalletAddressForCurrency(
    defaultCurrency,
    solanaAddress,
    ethereumAddress
  );

  // Convex actions & mutations
  const signUrl = useAction(api.funding.moonpay.signUrl);
  const createSingleUseAddress = useAction(api.funding.moonpay.createSingleUseDepositAddress);
  const initializeTransaction = useMutation(api.funding.moonpay.initializeTransaction);

  // Buy SDK instance
  const buySdk = useMoonPaySdk({
    sdkConfig: {
      flow: 'buy',
      environment: MOONPAY_ENVIRONMENT,
      params: {
        apiKey: MOONPAY_API_KEY,
        currencyCode: defaultCurrency,
        walletAddress: effectiveWalletAddress,
        showWalletAddressForm: !effectiveWalletAddress ? 'true' : 'false',
      },
    },
    browserOpener: {
      open: async (url: string) => {
        await WebBrowser.openBrowserAsync(url);
      },
    },
  });

  // Sell SDK instance
  const sellSdk = useMoonPaySdk({
    sdkConfig: {
      flow: 'sell',
      environment: MOONPAY_ENVIRONMENT,
      params: {
        apiKey: MOONPAY_API_KEY,
        baseCurrencyCode: defaultCurrency,
        refundWalletAddress: effectiveWalletAddress,
      },
    },
    browserOpener: {
      open: async (url: string) => {
        await WebBrowser.openBrowserAsync(url);
      },
    },
  });

  // Sign URL and update SDK on mount/wallet change
  useEffect(() => {
    const signAndUpdateBuy = async () => {
      // Wait for SDK to be ready
      if (!buySdk.ready || !buySdk.generateUrlForSigning) return;

      try {
        // Generate URL for signing with required variant parameter
        const urlToSign = buySdk.generateUrlForSigning({ variant: 'inapp-browser' });
        console.log('[MoonPay SDK] Buy URL to sign:', urlToSign);
        if (!urlToSign) return;

        const { signature } = await signUrl({ urlToSign });
        console.log('[MoonPay SDK] Buy signature received:', signature);
        buySdk.updateSignature?.(signature);
      } catch (err) {
        console.error('Failed to sign buy URL:', err);
        setError('Failed to initialize MoonPay');
      }
    };

    const signAndUpdateSell = async () => {
      // Wait for SDK to be ready
      if (!sellSdk.ready || !sellSdk.generateUrlForSigning) return;

      try {
        // Generate URL for signing with required variant parameter
        const urlToSign = sellSdk.generateUrlForSigning({ variant: 'inapp-browser' });
        console.log('[MoonPay SDK] Sell URL to sign:', urlToSign);
        if (!urlToSign) return;

        const { signature } = await signUrl({ urlToSign });
        console.log('[MoonPay SDK] Sell signature received:', signature);
        sellSdk.updateSignature?.(signature);
      } catch (err) {
        console.error('Failed to sign sell URL:', err);
      }
    };

    signAndUpdateBuy();
    signAndUpdateSell();
  }, [effectiveWalletAddress, buySdk.ready, sellSdk.ready]);

  /**
   * Get or create a single-use privacy deposit address
   */
  const getPrivacyAddress = useCallback(async (): Promise<string | null> => {
    // Check cache first
    if (privacyAddressCache.current && privacyAddressCache.current.expiresAt > Date.now()) {
      console.log('[MoonPay] Using cached privacy address:', privacyAddressCache.current.address);
      return privacyAddressCache.current.address;
    }

    try {
      console.log('[MoonPay] Creating single-use privacy deposit address...');
      const result = await createSingleUseAddress({});

      // Cache for reuse within this session
      privacyAddressCache.current = {
        address: result.depositAddress,
        expiresAt: result.expiresAt,
      };

      console.log('[MoonPay] Privacy address created:', result.depositAddress);
      return result.depositAddress;
    } catch (err) {
      console.warn('[MoonPay] Failed to create privacy address, falling back to main wallet:', err);
      return null;
    }
  }, [createSingleUseAddress]);

  /**
   * Open buy flow in browser
   */
  const openBuy = useCallback(
    async (buyOptions?: { currencyCode?: string; baseCurrencyAmount?: number }) => {
      setIsLoading(true);
      setError(null);

      try {
        const currency = buyOptions?.currencyCode || defaultCurrency;
        const amount = buyOptions?.baseCurrencyAmount;

        // Step 1: Create tracking record so webhooks can find this transaction
        const amountInCents = amount ? Math.round(amount * 100) : 1000; // Default $10 minimum
        const cryptoCurrency = currency.replace(/_sol$/, ''); // Strip _sol suffix for backend
        const { transactionId } = await initializeTransaction({
          fiatCurrency: 'usd',
          fiatAmount: amountInCents,
          cryptoCurrency,
        });
        lastTransactionIdRef.current = transactionId;
        setLastTransactionId(transactionId);
        console.log('[MoonPay] Transaction initialized:', transactionId);

        // Step 2: Determine the deposit address
        let walletAddr: string | undefined;

        // For Solana currencies with privacy enabled, use single-use address
        if (usePrivacyAddress && isSolanaCurrency(currency)) {
          const privacyAddr = await getPrivacyAddress();
          if (privacyAddr) {
            walletAddr = privacyAddr;
            console.log('[MoonPay] Using privacy deposit address:', walletAddr);
          } else {
            // Fallback to main wallet if privacy address creation fails
            walletAddr = getWalletAddressForCurrency(currency, solanaAddress, ethereumAddress);
            console.log('[MoonPay] Fallback to main wallet:', walletAddr);
          }
        } else {
          // Non-Solana or privacy disabled - use main wallet
          walletAddr = getWalletAddressForCurrency(currency, solanaAddress, ethereumAddress);
        }

        // Step 3: Build the MoonPay URL with tracking ID + all params
        const baseUrl = MOONPAY_ENVIRONMENT === 'sandbox'
          ? 'https://buy-sandbox.moonpay.com'
          : 'https://buy.moonpay.com';

        const params = new URLSearchParams({
          apiKey: MOONPAY_API_KEY,
          currencyCode: currency,
          externalTransactionId: transactionId,
          ...(walletAddr && { walletAddress: walletAddr }),
          ...(amount && { baseCurrencyAmount: amount.toString() }),
          showWalletAddressForm: walletAddr ? 'false' : 'true',
        });

        const urlToSign = `${baseUrl}?${params.toString()}`;
        console.log('[MoonPay] Buy URL to sign:', urlToSign);

        // Sign the URL
        const { signature } = await signUrl({ urlToSign });
        console.log('[MoonPay] Signature received:', signature);

        // Open the signed URL
        const signedUrl = `${urlToSign}&signature=${encodeURIComponent(signature)}`;
        await WebBrowser.openBrowserAsync(signedUrl);

        // Trigger refresh when browser closes (deposit may have completed)
        // The actual refresh will happen via webhook → auto-shield → event
        emitRefreshEvent('deposit_completed');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open MoonPay';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [defaultCurrency, solanaAddress, ethereumAddress, signUrl, usePrivacyAddress, getPrivacyAddress, initializeTransaction]
  );

  /**
   * Open sell flow in browser
   */
  const openSell = useCallback(
    async (sellOptions?: { currencyCode?: string; quoteCurrencyAmount?: number }) => {
      setIsLoading(true);
      setError(null);

      try {
        const currency = sellOptions?.currencyCode || defaultCurrency;
        const amount = sellOptions?.quoteCurrencyAmount;

        // Get the correct wallet address for the selected currency
        const walletAddr = getWalletAddressForCurrency(currency, solanaAddress, ethereumAddress);

        // Build the MoonPay sell URL with all params
        const baseUrl = MOONPAY_ENVIRONMENT === 'sandbox'
          ? 'https://sell-sandbox.moonpay.com'
          : 'https://sell.moonpay.com';

        const params = new URLSearchParams({
          apiKey: MOONPAY_API_KEY,
          baseCurrencyCode: currency,
          ...(walletAddr && { refundWalletAddress: walletAddr }),
          ...(amount && { quoteCurrencyAmount: amount.toString() }),
        });

        const urlToSign = `${baseUrl}?${params.toString()}`;
        console.log('[MoonPay] Sell URL to sign:', urlToSign);

        // Sign the URL
        const { signature } = await signUrl({ urlToSign });
        console.log('[MoonPay] Signature received:', signature);

        // Open the signed URL
        const signedUrl = `${urlToSign}&signature=${encodeURIComponent(signature)}`;
        await WebBrowser.openBrowserAsync(signedUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open MoonPay';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [defaultCurrency, solanaAddress, ethereumAddress, signUrl]
  );

  return {
    openBuy,
    openSell,
    MoonPayBuyWebView: buySdk.MoonPayWebViewComponent || null,
    MoonPaySellWebView: sellSdk.MoonPayWebViewComponent || null,
    isReady: !!MOONPAY_API_KEY && buySdk.ready,
    isLoading,
    error,
    lastTransactionId,
  };
}

/**
 * Simplified hook for quick USDC deposit on Solana
 *
 * Uses single-use privacy addresses by default to break
 * the KYC → wallet link for enhanced privacy.
 */
export function useQuickDeposit(walletAddress?: string | null) {
  const moonpay = useMoonPay({
    solanaAddress: walletAddress,
    defaultCurrency: 'usdc_sol', // Solana USDC for privacy address support
    usePrivacyAddress: true,
  });

  const deposit = useCallback(
    async (amount?: number) => {
      await moonpay.openBuy({
        currencyCode: 'usdc_sol',
        baseCurrencyAmount: amount,
      });
    },
    [moonpay]
  );

  return {
    deposit,
    isReady: moonpay.isReady,
    isLoading: moonpay.isLoading,
    error: moonpay.error,
  };
}
