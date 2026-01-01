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

interface UseMoonPayOptions {
  walletAddress?: string | null;
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
  const { walletAddress, defaultCurrency = 'usdc' } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        walletAddress: walletAddress || undefined,
        showWalletAddressForm: !walletAddress,
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
        refundWalletAddress: walletAddress || undefined,
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
        // Pass variant to generateUrlForSigning
        const urlToSign = buySdk.generateUrlForSigning({ variant: 'overlay' });
        if (!urlToSign) return;

        const { signature } = await signUrl({ urlToSign });
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
        // Pass variant to generateUrlForSigning
        const urlToSign = sellSdk.generateUrlForSigning({ variant: 'overlay' });
        if (!urlToSign) return;

        const { signature } = await signUrl({ urlToSign });
        sellSdk.updateSignature?.(signature);
      } catch (err) {
        console.error('Failed to sign sell URL:', err);
      }
    };

    signAndUpdateBuy();
    signAndUpdateSell();
  }, [walletAddress, buySdk.ready, sellSdk.ready]);

  /**
   * Open buy flow in browser
   */
  const openBuy = useCallback(
    async (buyOptions?: { currencyCode?: string; baseCurrencyAmount?: number }) => {
      setIsLoading(true);
      setError(null);

      try {
        // If custom options, we need to regenerate and sign
        if (buyOptions?.currencyCode || buyOptions?.baseCurrencyAmount) {
          // For now, just open with default params
          // TODO: Support dynamic params by creating new SDK instance
        }

        await buySdk.openWithInAppBrowser?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open MoonPay';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [buySdk]
  );

  /**
   * Open sell flow in browser
   */
  const openSell = useCallback(
    async (sellOptions?: { currencyCode?: string; quoteCurrencyAmount?: number }) => {
      setIsLoading(true);
      setError(null);

      try {
        await sellSdk.openWithInAppBrowser?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open MoonPay';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sellSdk]
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
