/**
 * Card Provider Factory
 *
 * Factory for creating card provider instances.
 * Supports both Marqeta (KYC + JIT) and Starpay (no-KYC + prepaid).
 */

import type { CardProvider, ProviderName, ProviderConfig } from './types';

// Lazy imports to avoid loading unused providers
let marqetaProvider: CardProvider | null = null;
let starpayProvider: CardProvider | null = null;

/**
 * Get a card provider instance by name
 * @param name - Provider name ('marqeta' or 'starpay')
 * @returns Card provider instance
 */
export async function getCardProvider(name: ProviderName): Promise<CardProvider> {
  switch (name) {
    case 'marqeta':
      if (!marqetaProvider) {
        const { MarqetaProvider } = await import('./marqetaProvider');
        marqetaProvider = new MarqetaProvider();
      }
      return marqetaProvider;

    case 'starpay':
      if (!starpayProvider) {
        const { StarpayProvider } = await import('./starpayProvider');
        starpayProvider = new StarpayProvider();
      }
      return starpayProvider;

    default:
      throw new Error(`Unknown card provider: ${name}`);
  }
}

/**
 * Get all available card providers
 * @returns Map of provider name to provider instance
 */
export async function getAllProviders(): Promise<Map<ProviderName, CardProvider>> {
  const providers = new Map<ProviderName, CardProvider>();

  // Check which providers are configured
  if (isMarqetaConfigured()) {
    providers.set('marqeta', await getCardProvider('marqeta'));
  }

  if (isStarpayConfigured()) {
    providers.set('starpay', await getCardProvider('starpay'));
  }

  return providers;
}

/**
 * Check if Marqeta is configured
 */
export function isMarqetaConfigured(): boolean {
  return !!(
    process.env.MARQETA_APPLICATION_TOKEN &&
    process.env.MARQETA_ACCESS_TOKEN &&
    process.env.MARQETA_CARD_PRODUCT_TOKEN
  );
}

/**
 * Check if Starpay is configured
 */
export function isStarpayConfigured(): boolean {
  return !!process.env.STARPAY_API_KEY;
}

/**
 * Get provider info for UI display
 */
export interface ProviderInfo {
  name: ProviderName;
  displayName: string;
  description: string;
  requiresKyc: boolean;
  fundingModel: 'jit' | 'prepaid';
  isConfigured: boolean;
  features: string[];
}

export function getProviderInfo(name: ProviderName): ProviderInfo {
  switch (name) {
    case 'marqeta':
      return {
        name: 'marqeta',
        displayName: 'Standard Card',
        description: 'Requires verification. Funds stay in wallet until you spend.',
        requiresKyc: true,
        fundingModel: 'jit',
        isConfigured: isMarqetaConfigured(),
        features: [
          'Real-time spending from wallet',
          'Reloadable balance',
          'Full fraud protection',
          'Spending limits & controls',
        ],
      };

    case 'starpay':
      return {
        name: 'starpay',
        displayName: 'Instant Card',
        description: 'No verification. Load funds upfront for immediate use.',
        requiresKyc: false,
        fundingModel: 'prepaid',
        isConfigured: isStarpayConfigured(),
        features: [
          'No KYC required',
          'Instant activation',
          'Privacy-preserving top-ups',
          'Fixed spending limit',
        ],
      };

    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

/**
 * Get all available provider info for UI
 */
export function getAvailableProviders(): ProviderInfo[] {
  const providers: ProviderInfo[] = [];

  // Always show Marqeta first (primary option)
  const marqetaInfo = getProviderInfo('marqeta');
  if (marqetaInfo.isConfigured) {
    providers.push(marqetaInfo);
  }

  // Starpay as alternative
  const starpayInfo = getProviderInfo('starpay');
  if (starpayInfo.isConfigured) {
    providers.push(starpayInfo);
  }

  return providers;
}

// Re-export types
export * from './types';
