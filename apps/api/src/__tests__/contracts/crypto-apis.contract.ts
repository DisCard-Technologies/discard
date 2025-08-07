/**
 * Contract tests for external crypto APIs
 * Defines expected behavior without hitting real APIs
 */

export const CryptoAPIContracts = {
  alchemy: {
    getBalance: {
      request: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBalance',
          params: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca', 'latest']
        }
      },
      response: {
        status: 200,
        body: {
          jsonrpc: '2.0',
          id: 1,
          result: '0x1b1ae4d6e2ef500000' // 2 ETH in wei
        }
      }
    }
  },

  blockcypher: {
    getBitcoinBalance: {
      request: {
        method: 'GET',
        path: '/v1/btc/main/addrs/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa/balance'
      },
      response: {
        status: 200,
        body: {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          total_received: 6889085649,
          total_sent: 0,
          balance: 6889085649,
          unconfirmed_balance: 0,
          final_balance: 6889085649,
          n_tx: 1604,
          unconfirmed_n_tx: 0,
          final_n_tx: 1604
        }
      }
    }
  },

  coingecko: {
    getRates: {
      request: {
        method: 'GET',
        path: '/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd'
      },
      response: {
        status: 200,
        body: {
          bitcoin: { usd: 45000 },
          ethereum: { usd: 3000 }
        }
      }
    }
  }
};