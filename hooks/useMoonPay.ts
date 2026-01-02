/**
 * MoonPay React Native SDK Hook
 *
 * Wraps the official MoonPay SDK with Convex URL signing.
 * Provides buy and sell flows for crypto on/off-ramp.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMoonPaySdk } from '@moonpay/react-native-moonpay-sdk';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import * as WebBrowser from 'expo-web-browser';

// Get environment config
const MOONPAY_API_KEY = process.env.EXPO_PUBLIC_MOONPAY_API_KEY || '';
const MOONPAY_ENVIRONMENT = (process.env.EXPO_PUBLIC_MOONPAY_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

// Currencies that use Solana addresses (suffix _sol or 'sol')
const SOLANA_CURRENCIES = ['sol', 'usdc_sol', 'usdt_sol', 'bonk_sol'];

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
}

/**
 * Hook for MoonPay buy/sell flows
 */
export function useMoonPay(options: UseMoonPayOptions = {}): UseMoonPayReturn {
  const { walletAddress, solanaAddress, ethereumAddress, defaultCurrency = 'eth' } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine which wallet address to use based on currency
  // If legacy walletAddress is provided, use it; otherwise determine from currency
  const effectiveWalletAddress = walletAddress || getWalletAddressForCurrency(
    defaultCurrency,
    solanaAddress,
    ethereumAddress
  );

  // Convex action for signing URLs
  const signUrl = useAction(api.funding.moonpay.signUrl);

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
   * Open buy flow in browser
   */
  const openBuy = useCallback(
    async (buyOptions?: { currencyCode?: string; baseCurrencyAmount?: number }) => {
      setIsLoading(true);
      setError(null);

      try {
        const currency = buyOptions?.currencyCode || defaultCurrency;
        const amount = buyOptions?.baseCurrencyAmount;

        // Get the correct wallet address for the selected currency
        const walletAddr = getWalletAddressForCurrency(currency, solanaAddress, ethereumAddress);

        // Build the MoonPay URL with all params including amount
        const baseUrl = MOONPAY_ENVIRONMENT === 'sandbox'
          ? 'https://buy-sandbox.moonpay.com'
          : 'https://buy.moonpay.com';

        const params = new URLSearchParams({
          apiKey: MOONPAY_API_KEY,
          currencyCode: currency,
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
  };
}

/**
 * Simplified hook for quick USDC deposit
 */
export function useQuickDeposit(walletAddress?: string | null) {
  const moonpay = useMoonPay({
    walletAddress,
    defaultCurrency: 'usdc',
  });

  const deposit = useCallback(
    async (amount?: number) => {
      await moonpay.openBuy({
        currencyCode: 'usdc',
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
