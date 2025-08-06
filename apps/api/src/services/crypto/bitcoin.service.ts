import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../app';
import { blockchainService } from './blockchain.service';
import {
  BitcoinWalletRequest,
  BitcoinTransactionRequest,
  BitcoinWalletConnection,
  CryptoWalletError,
  CRYPTO_ERROR_CODES
} from '@discard/shared/src/types/crypto';

// Initialize ECPair with tiny-secp256k1
const ECPair = ECPairFactory(ecc);

interface BitcoinNetworkConfig {
  name: string;
  network: bitcoin.Network;
  apiBaseUrl: string;
  explorerUrl: string;
}

interface BitcoinUTXO {
  txid: string;
  vout: number;
  value: number;
  confirmations: number;
  scriptPubKey: string;
}

interface BitcoinBalance {
  confirmed: number;
  unconfirmed: number;
  total: number;
}

interface BitcoinTransactionFee {
  fast: number;    // satoshis per byte
  medium: number;  // satoshis per byte
  slow: number;    // satoshis per byte
}

export class BitcoinService {
  private readonly networks: Map<string, BitcoinNetworkConfig>;
  private readonly defaultNetwork: string = 'mainnet';
  private readonly BLOCKCYPHER_API_KEY: string;

  constructor() {
    this.BLOCKCYPHER_API_KEY = process.env.BLOCKCYPHER_API_KEY || '';
    
    this.networks = new Map([
      ['mainnet', {
        name: 'Bitcoin Mainnet',
        network: bitcoin.networks.bitcoin,
        apiBaseUrl: 'https://api.blockcypher.com/v1/btc/main',
        explorerUrl: 'https://blockstream.info'
      }],
      ['testnet', {
        name: 'Bitcoin Testnet',
        network: bitcoin.networks.testnet,
        apiBaseUrl: 'https://api.blockcypher.com/v1/btc/test3',
        explorerUrl: 'https://blockstream.info/testnet'
      }]
    ]);
  }

  /**
   * Validate Bitcoin address
   */
  validateBitcoinAddress(address: string, networkName: string = this.defaultNetwork): {
    isValid: boolean;
    error?: string;
    addressType?: string;
  } {
    try {
      const networkConfig = this.networks.get(networkName);
      if (!networkConfig) {
        return {
          isValid: false,
          error: `Unsupported network: ${networkName}`
        };
      }

      // Try to decode the address
      const decoded = bitcoin.address.toOutputScript(address, networkConfig.network);
      
      // Determine address type
      let addressType = 'unknown';
      if (address.startsWith('1')) {
        addressType = 'P2PKH'; // Pay to Public Key Hash
      } else if (address.startsWith('3')) {
        addressType = 'P2SH'; // Pay to Script Hash
      } else if (address.startsWith('bc1') && address.length === 42) {
        addressType = 'P2WPKH'; // Pay to Witness Public Key Hash
      } else if (address.startsWith('bc1') && address.length === 62) {
        addressType = 'P2WSH'; // Pay to Witness Script Hash
      }

      return {
        isValid: true,
        addressType
      };

    } catch (error: any) {
      return {
        isValid: false,
        error: `Invalid Bitcoin address: ${error.message}`
      };
    }
  }

  /**
   * Generate Bitcoin address QR code
   */
  async generateAddressQRCode(
    address: string, 
    amount?: number, 
    label?: string
  ): Promise<string> {
    try {
      // Validate address first
      const validation = this.validateBitcoinAddress(address);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // Create Bitcoin URI
      let bitcoinUri = `bitcoin:${address}`;
      const params: string[] = [];

      if (amount && amount > 0) {
        params.push(`amount=${amount}`);
      }

      if (label) {
        params.push(`label=${encodeURIComponent(label)}`);
      }

      if (params.length > 0) {
        bitcoinUri += `?${params.join('&')}`;
      }

      // Generate QR code as data URL
      const qrCodeDataUrl = await qrcode.toDataURL(bitcoinUri, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });

      return qrCodeDataUrl;

    } catch (error) {
      console.error('Failed to generate Bitcoin QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Connect Bitcoin wallet by importing address
   */
  async connectBitcoinWallet(
    userId: string,
    request: BitcoinWalletRequest
  ): Promise<BitcoinWalletConnection> {
    try {
      const { address, walletName, network = this.defaultNetwork } = request;

      // Validate Bitcoin address
      const validation = this.validateBitcoinAddress(address, network);
      if (!validation.isValid) {
        throw {
          code: CRYPTO_ERROR_CODES.INVALID_WALLET_ADDRESS,
          message: 'Invalid Bitcoin address',
          details: { error: validation.error }
        } as CryptoWalletError;
      }

      // Check if address is already connected for this user
      const { data: existingWallet, error: checkError } = await supabase
        .from('crypto_wallets')
        .select('wallet_id')
        .eq('user_id', userId)
        .eq('wallet_type', 'bitcoin')
        .eq('wallet_address_hash', this.hashBitcoinAddress(address))
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Database error checking existing wallet:', checkError);
        throw new Error('Failed to check existing wallet');
      }

      if (existingWallet) {
        throw {
          code: CRYPTO_ERROR_CODES.WALLET_CONNECTION_FAILED,
          message: 'Bitcoin address already connected',
          details: { walletId: existingWallet.wallet_id }
        } as CryptoWalletError;
      }

      // Get initial balance
      const balance = await this.getBitcoinBalance(address, network);

      // Create wallet record
      const walletId = uuidv4();
      const encryptedAddress = await this.encryptBitcoinAddress(address);

      const { data: wallet, error: insertError } = await supabase
        .from('crypto_wallets')
        .insert({
          wallet_id: walletId,
          user_id: userId,
          wallet_type: 'bitcoin',
          wallet_address_encrypted: encryptedAddress,
          wallet_address_hash: this.hashBitcoinAddress(address),
          wallet_name: walletName || 'Bitcoin Wallet',
          connection_status: 'connected',
          permissions: ['view_balance', 'create_transaction'], // Bitcoin wallets are view-only by default
          supported_currencies: ['BTC'],
          last_balance_check: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('Database error creating Bitcoin wallet:', insertError);
        throw new Error('Failed to save wallet connection');
      }

      // Generate QR code for the address
      const qrCode = await this.generateAddressQRCode(address, undefined, walletName);

      const connection: BitcoinWalletConnection = {
        walletId: wallet.wallet_id,
        address,
        network,
        addressType: validation.addressType || 'unknown',
        walletName: wallet.wallet_name,
        balance,
        connectionStatus: 'connected',
        qrCode,
        explorerUrl: `${this.networks.get(network)?.explorerUrl}/address/${address}`,
        supportedCurrencies: ['BTC'],
        createdAt: wallet.created_at
      };

      console.log('Bitcoin wallet connected successfully:', walletId);

      return connection;

    } catch (error: any) {
      console.error('Failed to connect Bitcoin wallet:', error);
      if (error.code) {
        throw error; // Re-throw crypto wallet errors
      }
      throw {
        code: CRYPTO_ERROR_CODES.WALLET_CONNECTION_FAILED,
        message: 'Failed to connect Bitcoin wallet',
        details: { error: error.message }
      } as CryptoWalletError;
    }
  }

  /**
   * Get Bitcoin balance for an address
   */
  async getBitcoinBalance(
    address: string, 
    network: string = this.defaultNetwork
  ): Promise<BitcoinBalance> {
    try {
      const networkConfig = this.networks.get(network);
      if (!networkConfig) {
        throw new Error(`Unsupported network: ${network}`);
      }

      // Use BlockCypher API to get balance
      const apiUrl = `${networkConfig.apiBaseUrl}/addrs/${address}/balance`;
      const url = this.BLOCKCYPHER_API_KEY ? 
        `${apiUrl}?token=${this.BLOCKCYPHER_API_KEY}` : 
        apiUrl;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          // Address not found, return zero balance
          return { confirmed: 0, unconfirmed: 0, total: 0 };
        }
        throw new Error(`BlockCypher API error: ${response.status}`);
      }

      const data = await response.json();

      // Convert from satoshis to BTC
      const confirmed = (data.balance || 0) / 100000000;
      const unconfirmed = (data.unconfirmed_balance || 0) / 100000000;

      return {
        confirmed,
        unconfirmed,
        total: confirmed + unconfirmed
      };

    } catch (error: any) {
      console.error('Failed to get Bitcoin balance:', error);
      throw new Error(`Failed to get Bitcoin balance: ${error.message}`);
    }
  }

  /**
   * Get UTXOs for a Bitcoin address
   */
  async getBitcoinUTXOs(
    address: string, 
    network: string = this.defaultNetwork
  ): Promise<BitcoinUTXO[]> {
    try {
      const networkConfig = this.networks.get(network);
      if (!networkConfig) {
        throw new Error(`Unsupported network: ${network}`);
      }

      // Use BlockCypher API to get UTXOs
      const apiUrl = `${networkConfig.apiBaseUrl}/addrs/${address}?unspentOnly=true`;
      const url = this.BLOCKCYPHER_API_KEY ? 
        `${apiUrl}&token=${this.BLOCKCYPHER_API_KEY}` : 
        apiUrl;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return []; // Address not found, return empty UTXOs
        }
        throw new Error(`BlockCypher API error: ${response.status}`);
      }

      const data = await response.json();

      // Transform BlockCypher UTXO format to our format
      const utxos: BitcoinUTXO[] = (data.txrefs || []).map((txref: any) => ({
        txid: txref.tx_hash,
        vout: txref.tx_output_n,
        value: txref.value, // in satoshis
        confirmations: txref.confirmations || 0,
        scriptPubKey: txref.script || ''
      }));

      return utxos;

    } catch (error: any) {
      console.error('Failed to get Bitcoin UTXOs:', error);
      throw new Error(`Failed to get Bitcoin UTXOs: ${error.message}`);
    }
  }

  /**
   * Get current Bitcoin transaction fees
   */
  async getBitcoinTransactionFees(network: string = this.defaultNetwork): Promise<BitcoinTransactionFee> {
    try {
      // Use a free API for fee estimation (mempool.space)
      const apiUrl = network === 'mainnet' ? 
        'https://mempool.space/api/v1/fees/recommended' :
        'https://mempool.space/testnet/api/v1/fees/recommended';

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Fee estimation API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        fast: data.fastestFee || 20,     // sat/byte
        medium: data.halfHourFee || 10,  // sat/byte
        slow: data.hourFee || 5          // sat/byte
      };

    } catch (error) {
      console.error('Failed to get Bitcoin transaction fees:', error);
      // Return fallback fees
      return {
        fast: 20,
        medium: 10,
        slow: 5
      };
    }
  }

  /**
   * Create unsigned Bitcoin transaction (for broadcasting by external wallet)
   */
  async createBitcoinTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number, // in BTC
    feeRate: number = 10, // satoshis per byte
    network: string = this.defaultNetwork
  ): Promise<{
    transaction: string;
    txid: string;
    size: number;
    fee: number;
    inputs: BitcoinUTXO[];
  }> {
    try {
      const networkConfig = this.networks.get(network);
      if (!networkConfig) {
        throw new Error(`Unsupported network: ${network}`);
      }

      // Validate addresses
      const fromValidation = this.validateBitcoinAddress(fromAddress, network);
      const toValidation = this.validateBitcoinAddress(toAddress, network);

      if (!fromValidation.isValid) {
        throw new Error(`Invalid from address: ${fromValidation.error}`);
      }

      if (!toValidation.isValid) {
        throw new Error(`Invalid to address: ${toValidation.error}`);
      }

      // Get UTXOs for the from address
      const utxos = await this.getBitcoinUTXOs(fromAddress, network);

      if (utxos.length === 0) {
        throw new Error('No UTXOs available for transaction');
      }

      // Convert amount to satoshis
      const amountSatoshis = Math.round(amount * 100000000);

      // Select UTXOs for the transaction (simple selection strategy)
      let totalInput = 0;
      const selectedUtxos: BitcoinUTXO[] = [];

      for (const utxo of utxos) {
        selectedUtxos.push(utxo);
        totalInput += utxo.value;

        // Estimate transaction size (simplified)
        const estimatedSize = selectedUtxos.length * 148 + 2 * 34 + 10;
        const estimatedFee = estimatedSize * feeRate;

        if (totalInput >= amountSatoshis + estimatedFee) {
          break;
        }
      }

      // Calculate actual transaction size and fee
      const transactionSize = selectedUtxos.length * 148 + 2 * 34 + 10;
      const transactionFee = transactionSize * feeRate;

      if (totalInput < amountSatoshis + transactionFee) {
        throw new Error('Insufficient funds for transaction');
      }

      // Create transaction builder
      const txb = new bitcoin.TransactionBuilder(networkConfig.network);

      // Add inputs
      for (const utxo of selectedUtxos) {
        txb.addInput(utxo.txid, utxo.vout);
      }

      // Add outputs
      txb.addOutput(toAddress, amountSatoshis);

      // Add change output if needed
      const change = totalInput - amountSatoshis - transactionFee;
      if (change > 546) { // Dust threshold
        txb.addOutput(fromAddress, change);
      }

      // Build unsigned transaction
      const transaction = txb.buildIncomplete();
      const txid = transaction.getId();

      return {
        transaction: transaction.toHex(),
        txid,
        size: transactionSize,
        fee: transactionFee / 100000000, // Convert back to BTC
        inputs: selectedUtxos
      };

    } catch (error: any) {
      console.error('Failed to create Bitcoin transaction:', error);
      throw new Error(`Failed to create Bitcoin transaction: ${error.message}`);
    }
  }

  /**
   * Broadcast Bitcoin transaction
   */
  async broadcastBitcoinTransaction(
    transactionHex: string,
    network: string = this.defaultNetwork
  ): Promise<string> {
    try {
      const networkConfig = this.networks.get(network);
      if (!networkConfig) {
        throw new Error(`Unsupported network: ${network}`);
      }

      // Use BlockCypher API to broadcast transaction
      const apiUrl = `${networkConfig.apiBaseUrl}/txs/push`;
      const url = this.BLOCKCYPHER_API_KEY ? 
        `${apiUrl}?token=${this.BLOCKCYPHER_API_KEY}` : 
        apiUrl;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tx: transactionHex
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Broadcast failed: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      return data.tx.hash; // Return transaction ID

    } catch (error: any) {
      console.error('Failed to broadcast Bitcoin transaction:', error);
      throw new Error(`Failed to broadcast transaction: ${error.message}`);
    }
  }

  /**
   * Get Bitcoin wallets for a user
   */
  async getBitcoinWallets(userId: string): Promise<BitcoinWalletConnection[]> {
    try {
      const { data: wallets, error } = await supabase
        .from('crypto_wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('wallet_type', 'bitcoin')
        .eq('connection_status', 'connected');

      if (error) {
        console.error('Database error fetching Bitcoin wallets:', error);
        throw new Error('Failed to fetch Bitcoin wallets');
      }

      const connections: BitcoinWalletConnection[] = [];

      for (const wallet of wallets) {
        try {
          // Decrypt address
          const address = await this.decryptBitcoinAddress(wallet.wallet_address_encrypted);
          
          // Get current balance
          const balance = await this.getBitcoinBalance(address);

          // Generate QR code
          const qrCode = await this.generateAddressQRCode(address, undefined, wallet.wallet_name);

          // Determine network from wallet metadata or default
          const network = wallet.wallet_metadata?.network || this.defaultNetwork;

          connections.push({
            walletId: wallet.wallet_id,
            address,
            network,
            addressType: wallet.wallet_metadata?.address_type || 'unknown',
            walletName: wallet.wallet_name,
            balance,
            connectionStatus: wallet.connection_status,
            qrCode,
            explorerUrl: `${this.networks.get(network)?.explorerUrl}/address/${address}`,
            supportedCurrencies: wallet.supported_currencies || ['BTC'],
            createdAt: wallet.created_at
          });

        } catch (walletError) {
          console.error(`Error processing wallet ${wallet.wallet_id}:`, walletError);
          // Continue with other wallets
        }
      }

      return connections;

    } catch (error) {
      console.error('Failed to get Bitcoin wallets:', error);
      throw error;
    }
  }

  /**
   * Disconnect Bitcoin wallet
   */
  async disconnectBitcoinWallet(userId: string, walletId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('crypto_wallets')
        .update({
          connection_status: 'disconnected',
          updated_at: new Date().toISOString()
        })
        .eq('wallet_id', walletId)
        .eq('user_id', userId)
        .eq('wallet_type', 'bitcoin');

      if (error) {
        console.error('Database error disconnecting Bitcoin wallet:', error);
        throw new Error('Failed to disconnect Bitcoin wallet');
      }

      console.log('Bitcoin wallet disconnected successfully:', walletId);

    } catch (error) {
      console.error('Failed to disconnect Bitcoin wallet:', error);
      throw error;
    }
  }

  /**
   * Encrypt Bitcoin address for storage
   */
  private async encryptBitcoinAddress(address: string): Promise<string> {
    // Use the same encryption method as blockchain service
    return await blockchainService.encryptWalletAddress(address);
  }

  /**
   * Decrypt Bitcoin address from storage
   */
  private async decryptBitcoinAddress(encryptedAddress: string): Promise<string> {
    // Use the same decryption method as blockchain service
    return await blockchainService.decryptWalletAddress(encryptedAddress);
  }

  /**
   * Hash Bitcoin address for database lookups
   */
  private hashBitcoinAddress(address: string): string {
    return blockchainService.hashWalletAddress(address);
  }

  /**
   * Get supported Bitcoin networks
   */
  getSupportedNetworks(): string[] {
    return Array.from(this.networks.keys());
  }

  /**
   * Check if Bitcoin service is configured
   */
  isConfigured(): boolean {
    return true; // Bitcoin service works without API keys (with rate limits)
  }

  /**
   * Get network configuration
   */
  getNetworkConfig(network: string): BitcoinNetworkConfig | undefined {
    return this.networks.get(network);
  }
}

export const bitcoinService = new BitcoinService();