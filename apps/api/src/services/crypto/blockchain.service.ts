import crypto from 'crypto';
import { 
  CryptoBalance, 
  CryptoWalletError,
  CRYPTO_ERROR_CODES 
} from '@discard/shared/src/types/crypto';

interface WalletValidationResult {
  isValid: boolean;
  error?: string;
}

interface BalanceResult {
  success: boolean;
  balances: CryptoBalance[];
  error?: CryptoWalletError;
}

export class BlockchainService {
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-cbc';
  private readonly ENCRYPTION_KEY: Buffer;

  constructor() {
    // In production, this should come from a secure KMS service
    const keyString = process.env.WALLET_ENCRYPTION_KEY || 'default-32-char-key-for-dev-only!';
    this.ENCRYPTION_KEY = Buffer.from(keyString.padEnd(32, '0').slice(0, 32));
  }

  /**
   * Validate wallet address format based on wallet type
   */
  async validateWalletAddress(walletType: string, address: string): Promise<WalletValidationResult> {
    try {
      switch (walletType) {
        case 'metamask':
        case 'walletconnect':
        case 'hardware':
          return this.validateEthereumAddress(address);
        
        case 'bitcoin':
          return this.validateBitcoinAddress(address);
        
        default:
          return {
            isValid: false,
            error: 'Unsupported wallet type'
          };
      }
    } catch (error) {
      console.error('Wallet address validation error:', error);
      return {
        isValid: false,
        error: 'Address validation failed'
      };
    }
  }

  /**
   * Validate Ethereum address format
   */
  private validateEthereumAddress(address: string): WalletValidationResult {
    // Basic Ethereum address validation (0x followed by 40 hex characters)
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    
    if (!ethAddressRegex.test(address)) {
      return {
        isValid: false,
        error: 'Invalid Ethereum address format'
      };
    }

    // Additional checksum validation could be added here
    return { isValid: true };
  }

  /**
   * Validate Bitcoin address format
   */
  private validateBitcoinAddress(address: string): WalletValidationResult {
    // Basic Bitcoin address validation (legacy, segwit, and bech32 formats)
    const legacyRegex = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
    const segwitRegex = /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/;
    const bech32Regex = /^bc1[a-z0-9]{39,59}$/;
    
    if (!legacyRegex.test(address) && !segwitRegex.test(address) && !bech32Regex.test(address)) {
      return {
        isValid: false,
        error: 'Invalid Bitcoin address format'
      };
    }

    return { isValid: true };
  }

  /**
   * Encrypt wallet address for storage
   */
  async encryptWalletAddress(address: string): Promise<string> {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.ENCRYPTION_ALGORITHM, this.ENCRYPTION_KEY);
      
      let encrypted = cipher.update(address, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Combine IV and encrypted data
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Wallet address encryption error:', error);
      throw new Error('Failed to encrypt wallet address');
    }
  }

  /**
   * Decrypt wallet address from storage
   */
  async decryptWalletAddress(encryptedAddress: string): Promise<string> {
    try {
      const parts = encryptedAddress.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted address format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];

      const decipher = crypto.createDecipher(this.ENCRYPTION_ALGORITHM, this.ENCRYPTION_KEY);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Wallet address decryption error:', error);
      throw new Error('Failed to decrypt wallet address');
    }
  }

  /**
   * Create hash of wallet address for database lookups
   */
  hashWalletAddress(address: string): string {
    return crypto.createHash('sha256').update(address.toLowerCase()).digest('hex');
  }

  /**
   * Get supported currencies for a wallet type
   */
  getSupportedCurrencies(walletType: string): string[] {
    switch (walletType) {
      case 'metamask':
      case 'walletconnect':
      case 'hardware':
        return ['ETH', 'USDT', 'USDC'];
      
      case 'bitcoin':
        return ['BTC'];
      
      default:
        return [];
    }
  }

  /**
   * Fetch wallet balances from blockchain
   */
  async getWalletBalances(
    walletType: string, 
    address: string, 
    currencies: string[]
  ): Promise<BalanceResult> {
    try {
      switch (walletType) {
        case 'metamask':
        case 'walletconnect':
        case 'hardware':
          return await this.getEthereumBalances(address, currencies);
        
        case 'bitcoin':
          return await this.getBitcoinBalance(address);
        
        default:
          return {
            success: false,
            balances: [],
            error: {
              code: CRYPTO_ERROR_CODES.UNSUPPORTED_WALLET_TYPE,
              message: 'Unsupported wallet type'
            }
          };
      }
    } catch (error) {
      console.error('Get wallet balances error:', error);
      return {
        success: false,
        balances: [],
        error: {
          code: CRYPTO_ERROR_CODES.BALANCE_FETCH_FAILED,
          message: 'Failed to fetch wallet balances'
        }
      };
    }
  }

  /**
   * Fetch Ethereum and ERC-20 token balances using Alchemy API
   */
  private async getEthereumBalances(address: string, currencies: string[]): Promise<BalanceResult> {
    try {
      const alchemyApiKey = process.env.ALCHEMY_API_KEY;
      const alchemyUrl = process.env.ALCHEMY_URL || 'https://eth-mainnet.g.alchemy.com/v2/';

      if (!alchemyApiKey) {
        throw new Error('Alchemy API key not configured');
      }

      const balances: CryptoBalance[] = [];

      // Fetch ETH balance
      if (currencies.includes('ETH')) {
        const ethBalance = await this.fetchEthBalance(address, alchemyUrl + alchemyApiKey);
        if (ethBalance) {
          balances.push(ethBalance);
        }
      }

      // Fetch ERC-20 token balances
      const erc20Currencies = currencies.filter(c => c !== 'ETH');
      if (erc20Currencies.length > 0) {
        const tokenBalances = await this.fetchERC20Balances(address, erc20Currencies, alchemyUrl + alchemyApiKey);
        balances.push(...tokenBalances);
      }

      return {
        success: true,
        balances: balances
      };

    } catch (error) {
      console.error('Ethereum balance fetch error:', error);
      return {
        success: false,
        balances: [],
        error: {
          code: CRYPTO_ERROR_CODES.NETWORK_ERROR,
          message: 'Failed to fetch Ethereum balances'
        }
      };
    }
  }

  /**
   * Fetch ETH balance
   */
  private async fetchEthBalance(address: string, alchemyUrl: string): Promise<CryptoBalance | null> {
    try {
      const response = await fetch(alchemyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest']
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      // Convert from wei to ETH (18 decimals)
      const balanceWei = BigInt(data.result);
      const balanceEth = (Number(balanceWei) / Math.pow(10, 18)).toString();

      return {
        currency: 'ETH',
        balance: balanceEth,
        usdValue: 0, // Will be calculated by the controller
        conversionRate: '0' // Will be set by the controller
      };

    } catch (error) {
      console.error('ETH balance fetch error:', error);
      return null;
    }
  }

  /**
   * Fetch ERC-20 token balances
   */
  private async fetchERC20Balances(address: string, currencies: string[], alchemyUrl: string): Promise<CryptoBalance[]> {
    const balances: CryptoBalance[] = [];

    // Token contract addresses (these should be configurable)
    const tokenContracts: Record<string, { address: string; decimals: number }> = {
      'USDT': { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
      'USDC': { address: '0xa0b86a33e6441d29e1b9fdb3c2be1a89e7c49a6e', decimals: 6 }
    };

    for (const currency of currencies) {
      const tokenContract = tokenContracts[currency];
      if (!tokenContract) {
        continue;
      }

      try {
        const response = await fetch(alchemyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{
              to: tokenContract.address,
              data: `0x70a08231000000000000000000000000${address.slice(2)}` // balanceOf(address)
            }, 'latest']
          })
        });

        const data = await response.json();
        
        if (data.error) {
          console.error(`${currency} balance fetch error:`, data.error);
          continue;
        }

        // Convert from token units to readable format
        const balanceRaw = BigInt(data.result);
        const balance = (Number(balanceRaw) / Math.pow(10, tokenContract.decimals)).toString();

        balances.push({
          currency: currency,
          balance: balance,
          usdValue: 0, // Will be calculated by the controller
          conversionRate: '0' // Will be set by the controller
        });

      } catch (error) {
        console.error(`${currency} balance fetch error:`, error);
        continue;
      }
    }

    return balances;
  }

  /**
   * Fetch Bitcoin balance
   */
  private async getBitcoinBalance(address: string): Promise<BalanceResult> {
    try {
      // Using a free Bitcoin API (in production, consider using a dedicated Bitcoin node)
      const response = await fetch(`https://blockstream.info/api/address/${address}`);
      
      if (!response.ok) {
        throw new Error(`Bitcoin API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Convert from satoshis to BTC (8 decimals)
      const balanceBtc = (data.chain_stats.funded_txo_sum / Math.pow(10, 8)).toString();

      return {
        success: true,
        balances: [{
          currency: 'BTC',
          balance: balanceBtc,
          usdValue: 0, // Will be calculated by the controller
          conversionRate: '0' // Will be set by the controller
        }]
      };

    } catch (error) {
      console.error('Bitcoin balance fetch error:', error);
      return {
        success: false,
        balances: [],
        error: {
          code: CRYPTO_ERROR_CODES.NETWORK_ERROR,
          message: 'Failed to fetch Bitcoin balance'
        }
      };
    }
  }

  /**
   * Rate limiting check for Alchemy API (300 compute units per second)
   */
  private async checkRateLimit(): Promise<boolean> {
    // Implementation for rate limiting - could use Redis or in-memory store
    // For now, return true (no rate limiting)
    return true;
  }
}

export const blockchainService = new BlockchainService();