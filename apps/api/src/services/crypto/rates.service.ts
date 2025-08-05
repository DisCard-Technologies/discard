import { ConversionRates } from '@discard/shared/src/types/crypto';

interface RateCache {
  rates: ConversionRates;
  lastUpdated: Date;
  ttl: number; // Time to live in milliseconds
}

export class RatesService {
  private cache: RateCache | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  private readonly COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price';
  
  // Mapping of our currency codes to CoinGecko IDs
  private readonly CURRENCY_MAPPING: Record<string, string> = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'USDT': 'tether',
    'USDC': 'usd-coin',
    'XRP': 'ripple'
  };

  /**
   * Get current conversion rates for specified currencies
   */
  async getCurrentRates(currencies: string[]): Promise<ConversionRates> {
    try {
      // Check if we have valid cached rates
      if (this.isCacheValid() && this.cache) {
        // Filter cache to only include requested currencies
        const filteredRates: ConversionRates = {};
        for (const currency of currencies) {
          if (this.cache.rates[currency]) {
            filteredRates[currency] = this.cache.rates[currency];
          }
        }
        
        // If all requested currencies are in cache, return them
        if (Object.keys(filteredRates).length === currencies.length) {
          return filteredRates;
        }
      }

      // Fetch fresh rates
      const freshRates = await this.fetchRatesFromAPI(currencies);
      
      // Update cache
      this.updateCache(freshRates);
      
      return freshRates;

    } catch (error) {
      console.error('Get current rates error:', error);
      
      // If there's an error and we have cached rates, return them
      if (this.cache) {
        const filteredRates: ConversionRates = {};
        for (const currency of currencies) {
          if (this.cache.rates[currency]) {
            filteredRates[currency] = this.cache.rates[currency];
          }
        }
        return filteredRates;
      }
      
      // Return empty rates with error indication
      const errorRates: ConversionRates = {};
      for (const currency of currencies) {
        errorRates[currency] = {
          usd: '0',
          lastUpdated: new Date().toISOString()
        };
      }
      return errorRates;
    }
  }

  /**
   * Fetch rates from CoinGecko API
   */
  private async fetchRatesFromAPI(currencies: string[]): Promise<ConversionRates> {
    try {
      // Map our currency codes to CoinGecko IDs
      const coinGeckoIds = currencies
        .map(currency => this.CURRENCY_MAPPING[currency])
        .filter(id => id !== undefined);

      if (coinGeckoIds.length === 0) {
        throw new Error('No valid currencies to fetch rates for');
      }

      const url = `${this.COINGECKO_API_URL}?ids=${coinGeckoIds.join(',')}&vs_currencies=usd`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'DisCard-API/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert CoinGecko response to our format
      const rates: ConversionRates = {};
      const currentTime = new Date().toISOString();

      for (const currency of currencies) {
        const coinGeckoId = this.CURRENCY_MAPPING[currency];
        if (coinGeckoId && data[coinGeckoId] && data[coinGeckoId].usd) {
          rates[currency] = {
            usd: data[coinGeckoId].usd.toString(),
            lastUpdated: currentTime
          };
        } else {
          // Set default rate if not found
          rates[currency] = {
            usd: '0',
            lastUpdated: currentTime
          };
        }
      }

      return rates;

    } catch (error) {
      console.error('Fetch rates from API error:', error);
      throw error;
    }
  }

  /**
   * Update the rates cache
   */
  private updateCache(rates: ConversionRates): void {
    try {
      this.cache = {
        rates: { ...this.cache?.rates, ...rates },
        lastUpdated: new Date(),
        ttl: this.CACHE_TTL
      };
    } catch (error) {
      console.error('Update cache error:', error);
    }
  }

  /**
   * Check if the current cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) {
      return false;
    }

    const now = new Date();
    const timeDiff = now.getTime() - this.cache.lastUpdated.getTime();
    
    return timeDiff < this.cache.ttl;
  }

  /**
   * Get a specific currency rate
   */
  async getRate(currency: string): Promise<string> {
    try {
      const rates = await this.getCurrentRates([currency]);
      return rates[currency]?.usd || '0';
    } catch (error) {
      console.error(`Get rate for ${currency} error:`, error);
      return '0';
    }
  }

  /**
   * Convert crypto amount to USD (in cents)
   */
  async convertToUSD(currency: string, amount: string): Promise<number> {
    try {
      const rate = await this.getRate(currency);
      const usdValue = parseFloat(amount) * parseFloat(rate);
      return Math.round(usdValue * 100); // Convert to cents
    } catch (error) {
      console.error(`Convert ${currency} to USD error:`, error);
      return 0;
    }
  }

  /**
   * Convert USD (in cents) to crypto amount
   */
  async convertFromUSD(currency: string, usdCents: number): Promise<string> {
    try {
      const rate = await this.getRate(currency);
      const rateFloat = parseFloat(rate);
      
      if (rateFloat === 0) {
        return '0';
      }
      
      const usdAmount = usdCents / 100; // Convert cents to dollars
      const cryptoAmount = usdAmount / rateFloat;
      
      return cryptoAmount.toString();
    } catch (error) {
      console.error(`Convert USD to ${currency} error:`, error);
      return '0';
    }
  }

  /**
   * Get all supported currencies
   */
  getSupportedCurrencies(): string[] {
    return Object.keys(this.CURRENCY_MAPPING);
  }

  /**
   * Clear the rates cache (useful for testing)
   */
  clearCache(): void {
    this.cache = null;
  }

  /**
   * Get cache status for debugging
   */
  getCacheStatus(): { isValid: boolean; lastUpdated: string | null; size: number } {
    return {
      isValid: this.isCacheValid(),
      lastUpdated: this.cache?.lastUpdated.toISOString() || null,
      size: this.cache ? Object.keys(this.cache.rates).length : 0
    };
  }

  /**
   * Preload rates for commonly used currencies
   */
  async preloadCommonRates(): Promise<void> {
    try {
      const commonCurrencies = ['BTC', 'ETH', 'USDT', 'USDC'];
      await this.getCurrentRates(commonCurrencies);
      console.log('Common rates preloaded successfully');
    } catch (error) {
      console.error('Preload common rates error:', error);
    }
  }

  /**
   * Get historical rate (placeholder for future implementation)
   */
  async getHistoricalRate(currency: string, date: Date): Promise<string> {
    // This would require a different API call to get historical data
    // For now, return current rate
    console.warn('Historical rates not implemented, returning current rate');
    return await this.getRate(currency);
  }
}

export const ratesService = new RatesService();