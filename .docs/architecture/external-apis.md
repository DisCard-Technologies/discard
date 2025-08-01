# External APIs

### Marqeta Card Processing API

- **Purpose:** Virtual card issuing, transaction processing, and card lifecycle management
- **Documentation:** https://www.marqeta.com/docs/core-api
- **Base URL(s):** https://sandbox-api.marqeta.com (sandbox), https://api.marqeta.com (production)
- **Authentication:** HTTP Basic Auth with Application Token and Access Token
- **Rate Limits:** 1000 requests per minute for card operations

**Key Endpoints Used:**
- `POST /cards` - Create new virtual card with spending controls
- `PUT /cards/{token}` - Update card status (activate, suspend, terminate)
- `GET /transactions` - Retrieve transaction history and real-time events

**Integration Notes:** Marqeta provides webhook notifications for real-time transaction updates. Production access requires onboarding and compliance review. They have experience with crypto companies (Coinbase Card).

### MoonPay/Circle Crypto Integration

- **Purpose:** Cryptocurrency to fiat conversion and stablecoin rails
- **Documentation:** 
  - MoonPay: https://developers.moonpay.com
  - Circle: https://developers.circle.com
- **Base URL(s):** 
  - MoonPay: https://api.moonpay.com
  - Circle: https://api.circle.com
- **Authentication:** API key authentication
- **Rate Limits:** MoonPay: 60 requests per minute, Circle: 1000 requests per minute

**Key Endpoints Used:**
- MoonPay `GET /currencies` - Available cryptocurrencies and rates
- MoonPay `POST /transactions` - Initiate crypto-to-fiat conversion
- Circle `POST /transfers` - USDC transfers and conversions

**Integration Notes:** MoonPay provides fiat on-ramp services, Circle offers programmable dollar infrastructure. Both have established compliance frameworks.

### Alchemy Blockchain API

- **Purpose:** Ethereum and multi-chain blockchain access
- **Documentation:** https://docs.alchemy.com
- **Base URL(s):** https://eth-mainnet.g.alchemy.com/v2/{apiKey}
- **Authentication:** API key in URL path
- **Rate Limits:** 300 compute units per second (Growth plan)

**Key Endpoints Used:**
- `POST /` - JSON-RPC calls for blockchain interaction
- `GET /v2/{apiKey}/getAssetTransfers` - Monitor wallet transactions
- WebSocket endpoints for real-time blockchain events

**Integration Notes:** Provides enhanced APIs beyond standard JSON-RPC, including NFT APIs, trace APIs, and better error handling.

### WalletConnect Integration

- **Purpose:** Multi-wallet connectivity for crypto funding
- **Documentation:** https://docs.walletconnect.com
- **Base URL(s):** Decentralized protocol using relay servers
- **Authentication:** Cryptographic session keys
- **Rate Limits:** No specific limits (peer-to-peer protocol)

**Key Endpoints Used:**
- Session establishment and management
- Transaction signing requests
- Account and chain switching

**Integration Notes:** WalletConnect v2 provides improved user experience and supports 100+ wallets. Requires careful handling of session management and connection state.

### Chainlink Price Feeds

- **Purpose:** Reliable cryptocurrency price data
- **Documentation:** https://docs.chain.link/data-feeds
- **Base URL(s):** On-chain oracle contracts
- **Authentication:** Blockchain transaction signatures
- **Rate Limits:** Blockchain network constraints

**Key Endpoints Used:**
- Price feed smart contracts for major crypto pairs
- Historical price data queries
- Price update frequency monitoring

**Integration Notes:** Decentralized price oracles provide tamper-resistant price data. Requires blockchain integration for price queries.

### 0x API for DEX Aggregation

- **Purpose:** Optimal cryptocurrency swap rates across decentralized exchanges
- **Documentation:** https://0x.org/docs/api
- **Base URL(s):** https://api.0x.org
- **Authentication:** API key (optional for rate limits)
- **Rate Limits:** 100 requests per minute (free), higher with API key

**Key Endpoints Used:**
- `GET /swap/v1/quote` - Get best swap rates across DEXs
- `GET /swap/v1/sources` - Available liquidity sources
- Price impact and slippage calculations

**Integration Notes:** Aggregates liquidity from 50+ DEXs including Uniswap, SushiSwap, Curve. Provides gas estimates and transaction data.

### Fireblocks Custody API

- **Purpose:** Institutional-grade cryptocurrency custody and transaction signing
- **Documentation:** https://developers.fireblocks.com
- **Base URL(s):** https://api.fireblocks.io
- **Authentication:** JWT with RSA private key signing
- **Rate Limits:** 1000 requests per minute

**Key Endpoints Used:**
- `POST /transactions` - Create and sign cryptocurrency transactions
- `GET /vault/accounts` - Manage custodial wallet accounts
- `GET /transactions/{txId}` - Transaction status and confirmations

**Integration Notes:** Provides MPC-based custody solution with institutional security controls. Requires onboarding and compliance verification.

### B2C2 OTC Liquidity

- **Purpose:** Institutional cryptocurrency liquidity for large orders
- **Documentation:** https://docs.b2c2.com
- **Base URL(s):** https://api.b2c2.com
- **Authentication:** API key and HMAC signature
- **Rate Limits:** 600 requests per minute

**Key Endpoints Used:**
- `GET /instruments` - Available trading pairs
- `POST /order` - Execute large cryptocurrency orders
- `GET /balance` - Account balance and positions

**Integration Notes:** Provides deep liquidity for large crypto conversions without market impact. Requires significant minimum volumes.
