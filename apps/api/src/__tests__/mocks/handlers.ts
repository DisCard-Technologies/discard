/**
 * MSW API request handlers for external crypto APIs
 * Replaces brittle fetch mocking with reliable, interceptor-based API mocking
 */

import { http, HttpResponse } from 'msw';

// Alchemy API handlers for Ethereum operations
export const alchemyHandlers = [
  // Ethereum balance check
  http.post('https://eth-mainnet.g.alchemy.com/v2/:apiKey', async ({ request, params }) => {
    const body = await request.json() as any;
    
    // Mock successful balance response
    if (body.method === 'eth_getBalance') {
      return HttpResponse.json({
        jsonrpc: '2.0',
        id: body.id,
        result: '0x1bc16d674ec80000' // 2 ETH in wei (2 * 10^18)
      });
    }
    
    // Mock successful transaction count
    if (body.method === 'eth_getTransactionCount') {
      return HttpResponse.json({
        jsonrpc: '2.0',
        id: body.id,
        result: '0x1' // 1 transaction
      });
    }
    
    // Mock successful gas price
    if (body.method === 'eth_gasPrice') {
      return HttpResponse.json({
        jsonrpc: '2.0',
        id: body.id,
        result: '0x9184e72a000' // 10000000000000 wei
      });
    }
    
    // Mock successful estimate gas
    if (body.method === 'eth_estimateGas') {
      return HttpResponse.json({
        jsonrpc: '2.0',
        id: body.id,
        result: '0x5208' // 21000 gas
      });
    }
    
    // Default response for unknown methods
    return HttpResponse.json({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    }, { status: 400 });
  }),
];

// BlockCypher API handlers for Bitcoin operations
export const blockcypherHandlers = [
  // Bitcoin balance check
  http.get('https://api.blockcypher.com/v1/btc/main/addrs/:address/balance', ({ params }) => {
    const mockBalances: Record<string, any> = {
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa': {
        address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        total_received: 6889085649,
        total_sent: 0,
        balance: 6889085649, // ~68.89 BTC in satoshis
        unconfirmed_balance: 0,
        final_balance: 6889085649,
        n_tx: 1604,
        unconfirmed_n_tx: 0,
        final_n_tx: 1604
      },
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2': {
        address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        total_received: 100000000,
        total_sent: 0,
        balance: 100000000, // 1 BTC in satoshis
        unconfirmed_balance: 0,
        final_balance: 100000000,
        n_tx: 1,
        unconfirmed_n_tx: 0,
        final_n_tx: 1
      }
    };
    
    const mockBalance = mockBalances[params.address as string];
    if (mockBalance) {
      return HttpResponse.json(mockBalance);
    }
    
    // Return zero balance for unknown addresses
    return HttpResponse.json({
      address: params.address,
      total_received: 0,
      total_sent: 0,
      balance: 0,
      unconfirmed_balance: 0,
      final_balance: 0,
      n_tx: 0,
      unconfirmed_n_tx: 0,
      final_n_tx: 0
    });
  }),

  // Bitcoin UTXO retrieval
  http.get('https://api.blockcypher.com/v1/btc/main/addrs/:address', ({ params, request }) => {
    const url = new URL(request.url);
    const unspentOnly = url.searchParams.get('unspentOnly');
    
    if (unspentOnly === 'true') {
      // Mock UTXO response
      const mockUtxos: Record<string, any> = {
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa': {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          total_received: 6889085649,
          total_sent: 0,
          balance: 6889085649,
          unconfirmed_balance: 0,
          final_balance: 6889085649,
          n_tx: 1604,
          unconfirmed_n_tx: 0,
          final_n_tx: 1604,
          txrefs: [
            {
              tx_hash: 'abc123def456789',
              tx_output_n: 0,
              value: 100000000, // 1 BTC
              confirmations: 6,
              script: '76a914389ffce9cd9ae88dcc0631e88a821ffdbe9bfe2615bb88ac'
            },
            {
              tx_hash: 'def456ghi789abc',
              tx_output_n: 1,
              value: 50000000, // 0.5 BTC
              confirmations: 10,
              script: '76a914389ffce9cd9ae88dcc0631e88a821ffdbe9bfe2615bb88ac'
            }
          ]
        }
      };
      
      const utxoData = mockUtxos[params.address as string];
      return HttpResponse.json(utxoData || { txrefs: [] });
    }
    
    return HttpResponse.json({ error: 'Invalid request' }, { status: 400 });
  }),

  // Bitcoin transaction broadcasting
  http.post('https://api.blockcypher.com/v1/btc/main/txs/push', async ({ request }) => {
    const body = await request.json() as any;
    
    if (body.tx) {
      return HttpResponse.json({
        tx: {
          hash: 'mock-broadcast-tx-hash-12345',
          received: new Date().toISOString()
        }
      });
    }
    
    return HttpResponse.json({ error: 'Invalid transaction' }, { status: 400 });
  }),

  // Bitcoin testnet endpoints
  http.get('https://api.blockcypher.com/v1/btc/test3/addrs/:address/balance', ({ params }) => {
    return HttpResponse.json({
      address: params.address,
      total_received: 50000000,
      total_sent: 0,
      balance: 50000000, // 0.5 BTC testnet
      unconfirmed_balance: 0,
      final_balance: 50000000,
      n_tx: 1,
      unconfirmed_n_tx: 0,
      final_n_tx: 1
    });
  }),

  http.post('https://api.blockcypher.com/v1/btc/test3/txs/push', async ({ request }) => {
    return HttpResponse.json({
      tx: {
        hash: 'mock-testnet-tx-hash-67890'
      }
    });
  }),
  
  // Blockstream.info API handlers (used by BlockchainService)
  http.get('https://blockstream.info/api/address/:address', ({ params }) => {
    const mockAddressData: Record<string, any> = {
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa': {
        address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        chain_stats: {
          funded_txo_count: 1604,
          funded_txo_sum: 100000000, // 1 BTC in satoshis
          spent_txo_count: 0,
          spent_txo_sum: 0,
          tx_count: 1604
        },
        mempool_stats: {
          funded_txo_count: 0,
          funded_txo_sum: 0,
          spent_txo_count: 0,
          spent_txo_sum: 0,
          tx_count: 0
        }
      }
    };
    
    const addressData = mockAddressData[params.address as string];
    if (addressData) {
      return HttpResponse.json(addressData);
    }
    
    // Return empty data for unknown addresses
    return HttpResponse.json({
      address: params.address,
      chain_stats: {
        funded_txo_count: 0,
        funded_txo_sum: 0,
        spent_txo_count: 0,
        spent_txo_sum: 0,
        tx_count: 0
      },
      mempool_stats: {
        funded_txo_count: 0,
        funded_txo_sum: 0,
        spent_txo_count: 0,
        spent_txo_sum: 0,
        tx_count: 0
      }
    });
  }),
];

// CoinGecko API handlers for rate information
export const coingeckoHandlers = [
  // Cryptocurrency price API
  http.get('https://api.coingecko.com/api/v3/simple/price', ({ request }) => {
    const url = new URL(request.url);
    const ids = url.searchParams.get('ids');
    const vsCurrencies = url.searchParams.get('vs_currencies') || 'usd';
    
    const mockRates: Record<string, Record<string, number>> = {
      bitcoin: { usd: 45000, eur: 38000, gbp: 33000 },
      ethereum: { usd: 3000, eur: 2500, gbp: 2200 },
      tether: { usd: 1.0, eur: 0.85, gbp: 0.75 },
      'usd-coin': { usd: 1.0, eur: 0.85, gbp: 0.75 },
      ripple: { usd: 0.6, eur: 0.51, gbp: 0.45 }
    };
    
    if (!ids) {
      return HttpResponse.json({ error: 'Missing required parameter: ids' }, { status: 400 });
    }
    
    const requestedIds = ids.split(',');
    const requestedCurrencies = vsCurrencies.split(',');
    const response: Record<string, Record<string, number>> = {};
    
    requestedIds.forEach(id => {
      if (mockRates[id]) {
        response[id] = {};
        requestedCurrencies.forEach(currency => {
          if (mockRates[id][currency] !== undefined) {
            response[id][currency] = mockRates[id][currency];
          }
        });
      }
    });
    
    return HttpResponse.json(response);
  }),
];

// Fee estimation APIs
export const feeEstimationHandlers = [
  // mempool.space fee estimation
  http.get('https://mempool.space/api/v1/fees/recommended', () => {
    return HttpResponse.json({
      fastestFee: 20, // sat/byte
      halfHourFee: 10,
      hourFee: 5,
      economyFee: 2,
      minimumFee: 1
    });
  }),

  // Testnet fee estimation
  http.get('https://mempool.space/testnet/api/v1/fees/recommended', () => {
    return HttpResponse.json({
      fastestFee: 15,
      halfHourFee: 8,
      hourFee: 3,
      economyFee: 1,
      minimumFee: 1
    });
  }),
];

// Combine all handlers
export const handlers = [
  ...alchemyHandlers,
  ...blockcypherHandlers,
  ...coingeckoHandlers,
  ...feeEstimationHandlers
];