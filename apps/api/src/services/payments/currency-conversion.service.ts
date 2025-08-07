import { createClient } from '@supabase/supabase-js';
import { Logger } from '../../utils/logger';
import axios from 'axios';

interface CurrencyConversionRequest {
  amount: number; // Amount in cents
  fromCurrency: string;
  toCurrency: string;
}

interface CurrencyConversionResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  targetCurrency: string;
  exchangeRate: number;
  conversionFee: number;
  totalCost: number;
  rateSource: string;
  rateTimestamp: Date;
}

interface ExchangeRateApiResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export class CurrencyConversionService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private logger = new Logger('CurrencyConversionService');
  
  // Configuration from environment variables
  private readonly exchangeApiUrl = process.env.EXCHANGE_RATE_API_URL || 'https://api.exchangerate-api.com/v4/latest/';
  private readonly exchangeApiKey = process.env.EXCHANGE_RATE_API_KEY;
  private readonly cacheTtlSeconds = parseInt(process.env.EXCHANGE_RATE_CACHE_TTL_SECONDS || '60');
  private readonly foreignTransactionFeePercent = parseFloat(process.env.FOREIGN_TRANSACTION_FEE_PERCENT || '2.5');
  private readonly exchangeRateMarkupPercent = parseFloat(process.env.EXCHANGE_RATE_MARKUP_PERCENT || '1.0');
  
  // Supported currencies whitelist
  private readonly supportedCurrencies = new Set([
    'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SEK', 'NZD',
    'MXN', 'SGD', 'HKD', 'NOK', 'KRW', 'TRY', 'RUB', 'INR', 'BRL', 'ZAR'
  ]);

  /**
   * Convert currency with transparent fee calculation
   */
  async convertCurrency(
    amount: number, 
    fromCurrency: string, 
    toCurrency: string = 'USD'
  ): Promise<CurrencyConversionResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Converting currency', {
        amount,
        fromCurrency,
        toCurrency
      });

      // Validate currencies
      this.validateCurrencies(fromCurrency, toCurrency);

      // If same currency, no conversion needed
      if (fromCurrency === toCurrency) {
        return {
          originalAmount: amount,
          originalCurrency: fromCurrency,
          convertedAmount: amount,
          targetCurrency: toCurrency,
          exchangeRate: 1.0,
          conversionFee: 0,
          totalCost: amount,
          rateSource: 'no_conversion',
          rateTimestamp: new Date()
        };
      }

      // Get exchange rate (cached or fresh)
      const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency);
      
      // Apply markup to exchange rate
      const markedUpRate = exchangeRate * (1 + this.exchangeRateMarkupPercent / 100);
      
      // Calculate converted amount
      const convertedAmount = Math.round(amount * markedUpRate);
      
      // Calculate foreign transaction fee
      const conversionFee = Math.round(convertedAmount * (this.foreignTransactionFeePercent / 100));
      
      // Calculate total cost
      const totalCost = convertedAmount + conversionFee;

      const conversionTime = Date.now() - startTime;
      
      const result: CurrencyConversionResult = {
        originalAmount: amount,
        originalCurrency: fromCurrency,
        convertedAmount,
        targetCurrency: toCurrency,
        exchangeRate: markedUpRate,
        conversionFee,
        totalCost,
        rateSource: 'exchangerate-api.com',
        rateTimestamp: new Date()
      };

      this.logger.info('Currency conversion completed', {
        ...result,
        conversionTimeMs: conversionTime
      });

      return result;
    } catch (error) {
      this.logger.error('Currency conversion failed', { error, amount, fromCurrency, toCurrency });
      throw new Error(`Currency conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get real-time exchange rate with caching
   */
  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    try {
      // Check cache first
      const cachedRate = await this.getCachedRate(fromCurrency, toCurrency);
      if (cachedRate) {
        this.logger.debug('Using cached exchange rate', { fromCurrency, toCurrency, rate: cachedRate });
        return cachedRate;
      }

      // Fetch fresh rate from API
      const freshRate = await this.fetchFreshExchangeRate(fromCurrency, toCurrency);
      
      // Cache the fresh rate
      await this.cacheExchangeRate(fromCurrency, toCurrency, freshRate);
      
      return freshRate;
    } catch (error) {
      this.logger.error('Failed to get exchange rate', { error, fromCurrency, toCurrency });
      
      // Try to get fallback rate (up to 5 minutes old)
      const fallbackRate = await this.getFallbackRate(fromCurrency, toCurrency);
      if (fallbackRate) {
        this.logger.warn('Using fallback exchange rate', { fromCurrency, toCurrency, rate: fallbackRate });
        return fallbackRate;
      }
      
      throw new Error(`Unable to get exchange rate for ${fromCurrency} to ${toCurrency}`);
    }
  }

  /**
   * Get currency conversion quote without executing
   */
  async getConversionQuote(
    amount: number, 
    fromCurrency: string, 
    toCurrency: string = 'USD'
  ): Promise<CurrencyConversionResult> {
    return this.convertCurrency(amount, fromCurrency, toCurrency);
  }

  /**
   * Get supported currencies list
   */
  getSupportedCurrencies(): string[] {
    return Array.from(this.supportedCurrencies).sort();
  }

  /**
   * Validate if currencies are supported
   */
  isCurrencySupported(currency: string): boolean {
    return this.supportedCurrencies.has(currency.toUpperCase());
  }

  /**
   * Get current conversion rates for all supported currencies
   */
  async getAllConversionRates(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
    try {
      this.validateCurrencies(baseCurrency);
      
      const rates: Record<string, number> = {};
      
      // Get rates for all supported currencies
      for (const currency of this.supportedCurrencies) {
        if (currency !== baseCurrency) {
          try {
            const rate = await this.getExchangeRate(baseCurrency, currency);
            rates[currency] = rate;
          } catch (error) {
            this.logger.warn(`Failed to get rate for ${currency}`, { error });
            // Continue with other currencies
          }
        }
      }
      
      rates[baseCurrency] = 1.0; // Base currency rate is always 1
      
      return rates;
    } catch (error) {
      this.logger.error('Failed to get all conversion rates', { error, baseCurrency });
      throw error;
    }
  }

  /**
   * Private: Validate currencies are supported
   */
  private validateCurrencies(fromCurrency: string, toCurrency?: string): void {
    const from = fromCurrency.toUpperCase();
    
    if (!this.supportedCurrencies.has(from)) {
      throw new Error(`Currency ${from} is not supported`);
    }
    
    if (toCurrency) {
      const to = toCurrency.toUpperCase();
      if (!this.supportedCurrencies.has(to)) {
        throw new Error(`Currency ${to} is not supported`);
      }
    }
  }

  /**
   * Private: Get cached exchange rate
   */
  private async getCachedRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
    try {
      const cacheExpiry = new Date(Date.now() - this.cacheTtlSeconds * 1000);
      
      const { data: cachedRate } = await this.supabase
        .from('currency_conversion_rates')
        .select('exchange_rate')
        .eq('from_currency', fromCurrency)
        .eq('to_currency', toCurrency)
        .eq('is_active', true)
        .gte('cached_at', cacheExpiry.toISOString())
        .order('cached_at', { ascending: false })
        .limit(1)
        .single();

      return cachedRate?.exchange_rate || null;
    } catch (error) {
      this.logger.debug('No cached rate found', { fromCurrency, toCurrency });
      return null;
    }
  }

  /**
   * Private: Fetch fresh exchange rate from API
   */
  private async fetchFreshExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    try {
      const apiUrl = `${this.exchangeApiUrl}${fromCurrency}`;
      const config = this.exchangeApiKey ? {
        headers: { 'Authorization': `Bearer ${this.exchangeApiKey}` }
      } : {};

      const response = await axios.get<ExchangeRateApiResponse>(apiUrl, config);
      
      if (!response.data.rates[toCurrency]) {
        throw new Error(`Exchange rate not available for ${toCurrency}`);
      }

      return response.data.rates[toCurrency];
    } catch (error) {
      this.logger.error('Failed to fetch exchange rate from API', { error, fromCurrency, toCurrency });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error('Exchange rate API rate limit exceeded');
        } else if (error.response?.status === 401) {
          throw new Error('Exchange rate API authentication failed');
        }
      }
      
      throw new Error('Failed to fetch current exchange rate');
    }
  }

  /**
   * Private: Cache exchange rate
   */
  private async cacheExchangeRate(
    fromCurrency: string, 
    toCurrency: string, 
    exchangeRate: number
  ): Promise<void> {
    try {
      const validUntil = new Date(Date.now() + this.cacheTtlSeconds * 1000);
      
      await this.supabase
        .from('currency_conversion_rates')
        .insert({
          from_currency: fromCurrency,
          to_currency: toCurrency,
          exchange_rate: exchangeRate,
          markup_percentage: this.exchangeRateMarkupPercent,
          fee_percentage: this.foreignTransactionFeePercent,
          valid_until: validUntil.toISOString(),
          is_active: true
        });
    } catch (error) {
      // Don't fail conversion if caching fails
      this.logger.warn('Failed to cache exchange rate', { error, fromCurrency, toCurrency });
    }
  }

  /**
   * Private: Get fallback rate (up to 5 minutes old)
   */
  private async getFallbackRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
    try {
      const fallbackExpiry = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
      
      const { data: fallbackRate } = await this.supabase
        .from('currency_conversion_rates')
        .select('exchange_rate')
        .eq('from_currency', fromCurrency)
        .eq('to_currency', toCurrency)
        .gte('cached_at', fallbackExpiry.toISOString())
        .order('cached_at', { ascending: false })
        .limit(1)
        .single();

      return fallbackRate?.exchange_rate || null;
    } catch (error) {
      this.logger.debug('No fallback rate found', { fromCurrency, toCurrency });
      return null;
    }
  }

  /**
   * Private: Clean up old cached rates (maintenance function)
   */
  async cleanupOldRates(): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
      
      const { data: deletedRates, count } = await this.supabase
        .from('currency_conversion_rates')
        .delete({ count: 'exact' })
        .lt('cached_at', cutoffTime.toISOString());

      const deletedCount = count || 0;
      this.logger.info('Cleaned up old exchange rates', { deletedCount });
      
      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to clean up old rates', { error });
      throw error;
    }
  }
}