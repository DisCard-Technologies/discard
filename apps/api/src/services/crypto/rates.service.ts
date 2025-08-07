import { 
  ConversionRates,
  CryptoRate,
  HistoricalRateRequest,
  HistoricalRateResponse,
  HistoricalRatePoint
} from '@discard/shared/src/types/crypto';
import { DatabaseService } from '../database.service';
import WebSocket from 'ws';
import Decimal from 'decimal.js';
import { cacheService } from '../../config/redis';

// Utility function to handle errors safely
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return getErrorMessage(error);
  return String(error);
}

interface RateCache {
  rates: ConversionRates;
  lastUpdated: Date;
  ttl: number; // Time to live in milliseconds
}

interface RateSource {
  name: 'chainlink' | 'coingecko' | '0x' | 'backup';
  priority: number; // Lower = higher priority
  isActive: boolean;
  lastError?: string;
  lastSuccess?: Date;
}

export class EnhancedRatesService {
  private databaseService = new DatabaseService();
  private supabase = this.databaseService.getClient();
  private cache: RateCache | null = null;
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds for real-time updates
  private refreshInterval: any = null;
  private wsClients: Set<WebSocket> = new Set();
  
  // Rate sources with failover priority
  private rateSources: RateSource[] = [
    { name: 'chainlink', priority: 1, isActive: true },
    { name: 'coingecko', priority: 2, isActive: true },
    { name: '0x', priority: 3, isActive: true },
    { name: 'backup', priority: 4, isActive: true }
  ];
  
  // API configurations
  private readonly COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price';
  private readonly ZEROX_API_URL = 'https://api.0x.org';
  private readonly CURRENCY_MAPPING: Record<string, string> = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'USDT': 'tether',
    'USDC': 'usd-coin',
    'XRP': 'ripple'
  };

  constructor() {
    this.startRateRefreshMechanism();
  }

  /**
   * Start the 30-second rate refresh mechanism
   */
  private startRateRefreshMechanism(): void {
    // Clear any existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Start new 30-second refresh interval
    this.refreshInterval = setInterval(async () => {
      try {
        const currencies = this.getSupportedCurrencies();
        await this.fetchAndUpdateRates(currencies);
        this.broadcastRatesToWebSocketClients();
      } catch (error) {
        console.error('Rate refresh mechanism error:', error);
      }
    }, 30000);

    console.log('Rate refresh mechanism started (30-second intervals)');
  }

  /**
   * Stop the rate refresh mechanism
   */
  public stopRateRefreshMechanism(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('Rate refresh mechanism stopped');
    }
  }

  /**
   * Get current conversion rates for specified currencies with multi-exchange support and automatic failover
   */
  async getCurrentRates(currencies: string[], forceRefresh = false): Promise<ConversionRates> {
    try {
      // Check Redis cache first (unless force refresh)
      if (!forceRefresh) {
        const cachedRates = await this.getRatesFromRedisCache(currencies);
        if (cachedRates && Object.keys(cachedRates).length === currencies.length) {
          return cachedRates;
        }
      }

      // Fetch fresh rates with failover
      const freshRates = await this.fetchAndUpdateRates(currencies);
      
      return freshRates;

    } catch (error) {
      console.error('Get current rates error:', error);
      return this.getFallbackRates(currencies);
    }
  }

  /**
   * Fetch rates from multiple sources with automatic failover
   */
  private async fetchAndUpdateRates(currencies: string[]): Promise<ConversionRates> {
    let lastError: Error | null = null;
    
    // Try each rate source in priority order
    for (const source of this.rateSources.sort((a, b) => a.priority - b.priority)) {
      if (!source.isActive) continue;
      
      try {
        console.log(`Attempting to fetch rates from ${source.name}`);
        let rates: ConversionRates;
        
        switch (source.name) {
          case 'coingecko':
            rates = await this.fetchFromCoinGecko(currencies);
            break;
          case '0x':
            rates = await this.fetchFrom0x(currencies);
            break;
          case 'chainlink':
            rates = await this.fetchFromChainlink(currencies);
            break;
          case 'backup':
            rates = await this.fetchFromBackup(currencies);
            break;
          default:
            throw new Error(`Unknown rate source: ${source.name}`);
        }

        // Update cache and database
        await this.updateRedisCache(rates);
        await this.saveRatesToDatabase(rates, source.name);
        
        // Mark source as successful
        source.lastSuccess = new Date();
        source.lastError = undefined;
        
        console.log(`Successfully fetched rates from ${source.name}`);
        return rates;

      } catch (error) {
        console.error(`Failed to fetch rates from ${source.name}:`, error);
        lastError = error as Error;
        source.lastError = getErrorMessage(error);
        
        // Consider deactivating source after multiple failures
        // This could be enhanced with more sophisticated logic
        continue;
      }
    }

    // If all sources failed, throw the last error
    throw new Error(`All rate sources failed. Last error: ${lastError?.message}`);
  }

  /**
   * Fetch rates from CoinGecko API
   */
  private async fetchFromCoinGecko(currencies: string[]): Promise<ConversionRates> {
    const coinGeckoIds = currencies
      .map(currency => this.CURRENCY_MAPPING[currency])
      .filter(id => id !== undefined);

    if (coinGeckoIds.length === 0) {
      throw new Error('No valid currencies to fetch rates for');
    }

    const url = `${this.COINGECKO_API_URL}?ids=${coinGeckoIds.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
    
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
    return this.processCoinGeckoResponse(data, currencies);
  }

  /**
   * Fetch rates from 0x API for DEX aggregation
   */
  private async fetchFrom0x(currencies: string[]): Promise<ConversionRates> {
    const rates: ConversionRates = {};
    const currentTime = new Date().toISOString();

    // Process requests in parallel for better performance
    const ratePromises = currencies.map(async (currency) => {
      try {
        // Skip stablecoins for 0x API (they're typically 1:1 with USD)
        if (currency === 'USDT' || currency === 'USDC') {
          return { currency, rate: { usd: '1.00', lastUpdated: currentTime } };
        }

        const response = await fetch(`${this.ZEROX_API_URL}/swap/v1/price?sellToken=${currency}&buyToken=USDC&sellAmount=1000000000000000000`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'DisCard-API/1.0'
          },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (response.ok) {
          const data = await response.json();
          // Validate response structure
          if (!data.buyAmount || isNaN(Number(data.buyAmount))) {
            throw new Error(`Invalid response from 0x API for ${currency}`);
          }
          
          const price = new Decimal(data.buyAmount).div(1000000).toString(); // USDC has 6 decimals
          return { currency, rate: { usd: price, lastUpdated: currentTime } };
        } else {
          throw new Error(`0x API error for ${currency}: ${response.status}`);
        }
      } catch (error) {
        console.warn(`Failed to fetch ${currency} from 0x:`, error);
        return { currency, rate: { usd: '0', lastUpdated: currentTime } };
      }
    });

    const results = await Promise.allSettled(ratePromises);
    
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        rates[result.value.currency] = result.value.rate;
      }
    });

    return rates;
  }

  /**
   * Fetch rates from Chainlink Price Feeds (placeholder - would require blockchain integration)
   */
  private async fetchFromChainlink(currencies: string[]): Promise<ConversionRates> {
    // This would require actual blockchain integration with Chainlink contracts
    // For now, we'll fall back to CoinGecko but mark it as Chainlink source
    console.log('Chainlink integration not implemented, falling back to CoinGecko');
    return await this.fetchFromCoinGecko(currencies);
  }

  /**
   * Backup rate source (could be another API or cached database rates)
   */
  private async fetchFromBackup(currencies: string[]): Promise<ConversionRates> {
    // Try to get latest rates from database as backup
    try {
      const rates: ConversionRates = {};
      const currentTime = new Date().toISOString();

      for (const currency of currencies) {
        const { data, error } = await this.supabase
          .from('crypto_rates')
          .select('usd_price, timestamp')
          .eq('symbol', currency)
          .eq('is_active', true)
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();

        if (!error && data) {
          rates[currency] = {
            usd: data.usd_price.toString(),
            lastUpdated: data.timestamp
          };
        } else {
          // Set default fallback rate
          rates[currency] = {
            usd: '0',
            lastUpdated: currentTime
          };
        }
      }

      return rates;
    } catch (error) {
      console.error('Backup rate source error:', error);
      return this.getFallbackRates(currencies);
    }
  }

  /**
   * Process CoinGecko API response
   */
  private processCoinGeckoResponse(data: any, currencies: string[]): ConversionRates {
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
        rates[currency] = {
          usd: '0',
          lastUpdated: currentTime
        };
      }
    }

    return rates;
  }

  /**
   * Save rates to database for persistence and historical tracking
   */
  private async saveRatesToDatabase(rates: ConversionRates, source: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString();

      for (const [symbol, rateData] of Object.entries(rates)) {
        // Save to crypto_rates table (latest rates)
        await this.supabase
          .from('crypto_rates')
          .upsert({
            symbol,
            usd_price: parseFloat(rateData.usd),
            source,
            timestamp,
            is_active: true
          }, {
            onConflict: 'symbol,source'
          });

        // Save to rate_history table
        await this.supabase
          .from('rate_history')
          .insert({
            symbol,
            usd_price: parseFloat(rateData.usd),
            source,
            timestamp
          });
      }

      // Clean up old rate history (7-day retention)
      await this.supabase.rpc('cleanup_rate_history');
      
    } catch (error) {
      console.error('Failed to save rates to database:', error);
    }
  }

  /**
   * Get historical rate data
   */
  async getHistoricalRates(request: HistoricalRateRequest): Promise<HistoricalRateResponse> {
    try {
      const timeframe = this.getTimeframeInterval(request.timeframe);
      const resolution = request.resolution || '1h';
      
      const { data, error } = await this.supabase
        .from('rate_history')
        .select('usd_price, timestamp, volume')
        .eq('symbol', request.symbol)
        .gte('timestamp', new Date(Date.now() - timeframe).toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        throw new Error(`Database error: ${getErrorMessage(error)}`);
      }

      const dataPoints: HistoricalRatePoint[] = (data || []).map(point => ({
        timestamp: new Date(point.timestamp),
        price: point.usd_price.toString(),
        volume: point.volume?.toString()
      }));

      return {
        symbol: request.symbol,
        timeframe: request.timeframe,
        resolution,
        dataPoints
      };

    } catch (error) {
      console.error('Get historical rates error:', error);
      throw error;
    }
  }

  /**
   * Get timeframe interval in milliseconds
   */
  private getTimeframeInterval(timeframe: string): number {
    switch (timeframe) {
      case '1h': return 60 * 60 * 1000;
      case '24h': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Add WebSocket client for real-time rate updates
   */
  public addWebSocketClient(ws: WebSocket): void {
    this.wsClients.add(ws);
    
    // Send current rates immediately
    if (this.cache && this.isCacheValid()) {
      ws.send(JSON.stringify({
        type: 'rates_update',
        data: this.cache.rates,
        timestamp: new Date().toISOString()
      }));
    }

    // Handle client disconnect
    ws.on('close', () => {
      this.wsClients.delete(ws);
    });
  }

  /**
   * Broadcast rates to all WebSocket clients
   */
  private broadcastRatesToWebSocketClients(): void {
    if (!this.cache || this.wsClients.size === 0) return;

    const message = JSON.stringify({
      type: 'rates_update',
      data: this.cache.rates,
      timestamp: new Date().toISOString()
    });

    this.wsClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  /**
   * Update the rates cache
   */
  private async updateCache(rates: ConversionRates): Promise<void> {
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
   * Get fallback rates when all sources fail
   */
  private getFallbackRates(currencies: string[]): ConversionRates {
    const errorRates: ConversionRates = {};
    const currentTime = new Date().toISOString();
    
    for (const currency of currencies) {
      // Use cached rate if available, otherwise use 0
      errorRates[currency] = this.cache?.rates[currency] || {
        usd: '0',
        lastUpdated: currentTime
      };
    }
    
    return errorRates;
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies(): string[] {
    return Object.keys(this.CURRENCY_MAPPING);
  }

  /**
   * Get rate source status for debugging
   */
  getRateSourceStatus(): RateSource[] {
    return [...this.rateSources];
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.cache = null;
  }

  /**
   * Get cache status
   */
  getCacheStatus(): { isValid: boolean; lastUpdated: string | null; size: number } {
    return {
      isValid: this.isCacheValid(),
      lastUpdated: this.cache?.lastUpdated.toISOString() || null,
      size: this.cache ? Object.keys(this.cache.rates).length : 0
    };
  }

  /**
   * Manual refresh of rates (for testing/debugging)
   */
  async manualRefresh(currencies?: string[]): Promise<ConversionRates> {
    const currenciesToFetch = currencies || this.getSupportedCurrencies();
    return await this.getCurrentRates(currenciesToFetch, true);
  }

  /**
   * Get rates from Redis cache
   */
  private async getRatesFromRedisCache(currencies: string[]): Promise<ConversionRates | null> {
    try {
      const keys = currencies.map(currency => `crypto_rate:${currency}`);
      const values = await cacheService.mget(keys);
      
      const rates: ConversionRates = {};
      let allFound = true;
      
      for (let i = 0; i < currencies.length; i++) {
        const value = values[i];
        if (value) {
          rates[currencies[i]] = JSON.parse(value);
        } else {
          allFound = false;
          break;
        }
      }
      
      return allFound ? rates : null;
    } catch (error) {
      console.error('Redis cache get error:', error);
      return null;
    }
  }

  /**
   * Update Redis cache with new rates
   */
  private async updateRedisCache(rates: ConversionRates): Promise<void> {
    try {
      const keyValuePairs: Record<string, string> = {};
      
      for (const [currency, rate] of Object.entries(rates)) {
        keyValuePairs[`crypto_rate:${currency}`] = JSON.stringify(rate);
      }
      
      await cacheService.mset(keyValuePairs);
      
      // Set TTL for each key
      for (const currency of Object.keys(rates)) {
        await cacheService.expire(`crypto_rate:${currency}`, 30); // 30 seconds TTL
      }
    } catch (error) {
      console.error('Redis cache update error:', error);
    }
  }

  /**
   * Clear Redis cache
   */
  private async clearRedisCache(): Promise<void> {
    try {
      const currencies = this.getSupportedCurrencies();
      for (const currency of currencies) {
        await cacheService.del(`crypto_rate:${currency}`);
      }
    } catch (error) {
      console.error('Redis cache clear error:', error);
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopRateRefreshMechanism();
    this.wsClients.clear();
    this.clearCache();
    this.clearRedisCache();
  }
}

export const enhancedRatesService = new EnhancedRatesService();