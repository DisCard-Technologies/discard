# DisCard

> Intent-Centric Super Wallet with Virtual Global Card and AI Co-Pilot

DisCard is a mobile-first crypto wallet that combines disposable virtual debit cards with DeFi trading capabilities. Powered by conversational AI, users interact through natural language—describe what you want ("swap 50 USDC for SOL", "create a card with $100 limit") and the system parses your intent, clarifies ambiguity, and executes complex multi-step operations automatically.

**Key capabilities:**
- **Human Language Interface**: Conversational intent parsing with clarification flows for ambiguous commands
- **Dual AI Security**: Two LLMs in Phala TEE—"Brain" (orchestrator) parses intents, "Soul" (your financial persona) executes—each validates the other
- **Auto-Yield on Idle Funds**: Automatically deploy unused balances to DeFi protocols, withdraw seamlessly when needed
- **Instant Virtual Cards**: Disposable debit cards with crypto funding, self-healing on breach detection
- **MEV-Protected Trading**: Jupiter DEX integration with DFlow order flow for best execution
- **ZK-Compressed State**: Light Protocol for privacy-preserving wallet state on Solana

## Features

### Core Features
- **Intent-Centric UI**: Natural language command bar with conversational clarification
- **Dual AI Validation**: Brain orchestrates, Soul executes—mutual verification in Phala TEE
- **Auto-Yield**: Idle funds automatically deployed to DeFi, withdrawn on-demand
- **Instant Card Creation**: Generate virtual debit cards in seconds
- **Crypto Funding**: Support for SOL, USDC, and major Solana tokens
- **Privacy-First**: Cards with cryptographic isolation, no cross-card correlation
- **Self-Healing Cards**: Automatic reissue when breach detected

### Funding Options
- **Card Payments**: Fund via Stripe with credit/debit cards
- **MoonPay On-Ramp**: Buy crypto with card/bank and auto-convert to USD
- **Virtual IBAN**: Direct bank deposits via dedicated IBAN (EU/UK transfers)
- **Crypto Wallets**: Fund from connected ETH/SOL wallets
- **DeFi Yield**: Withdraw from Aave, Compound, and other yield positions

### Trading & Portfolio
- **Jupiter DEX Integration**: Token exploration with real-time prices and images
- **DFlow Order Flow**: MEV-protected swaps with best execution
- **Holdings Dashboard**: Portfolio tracking across all connected wallets
- **Transaction History**: Full audit trail with status tracking

### Security & Fraud Prevention
- **Real-time Fraud Detection**: Sub-800ms transaction analysis with 5 anomaly algorithms
- **Passkey Authentication**: WebAuthn with P-256 keys, no passwords
- **Automated Card Freezing**: Instant security response via Marqeta
- **Risk Scoring**: Velocity, amount, location, time, and merchant analysis

### Compliance
- **AML Monitoring**: Privacy-preserving anti-money laundering
- **KYC Integration**: Minimal data collection with document verification
- **Transaction Isolation**: Database-level separation preventing correlation

## Architecture

```
discard/
├── app/                    # Expo Router screens
│   ├── (tabs)/             # Main tabbed screens
│   │   ├── index.tsx       # Home/Dashboard
│   │   ├── card.tsx        # Cards management + creation
│   │   ├── holdings.tsx    # Asset holdings & portfolio
│   │   └── transfer.tsx    # Send/receive transfers
│   ├── auth.tsx            # Passkey authentication
│   ├── buy-crypto.tsx      # MoonPay integration
│   ├── sell-crypto.tsx     # Crypto off-ramp
│   ├── history.tsx         # Transaction history
│   ├── identity.tsx        # KYC flow
│   └── settings.tsx        # App settings
├── components/             # React Native UI components
│   ├── command-bar.tsx     # Natural language command interface
│   ├── explore-view.tsx    # Token exploration with Jupiter data
│   ├── market-detail-screen.tsx
│   ├── token-detail-screen.tsx
│   └── ui/                 # Shared UI components
├── convex/                 # Backend (serverless functions + DB)
│   ├── schema.ts           # Database schema (13 tables)
│   ├── auth/               # Passkey authentication
│   ├── cards/              # Card management + Marqeta API
│   ├── funding/            # Stripe + crypto funding
│   ├── intents/            # Claude AI intent parsing
│   ├── fraud/              # Fraud detection engine
│   ├── bridge/             # Turnkey integrations
│   ├── http.ts             # Webhook handlers
│   └── crons.ts            # Scheduled jobs
├── services/               # External API clients
│   ├── jupiterTokensClient.ts  # Jupiter token data
│   ├── jupiterUltraClient.ts   # Jupiter DEX swaps
│   ├── dflowClient.ts      # DFlow protocol integration
│   ├── dflowSwapClient.ts  # DFlow swap execution
│   └── brainClient.ts      # AI orchestrator
├── programs/               # Solana smart contracts (Anchor)
│   ├── discard-state/      # ZK compressed card state PDAs
│   ├── discard-hooks/      # Token-2022 transfer hooks
│   └── merchant-registry/  # On-chain merchant validation
├── packages/               # elizaOS plugins
│   ├── plugin-financial-armor/  # Turnkey bridging + TEE
│   └── plugin-brain-orchestrator/  # Intent parsing + planning
├── hooks/                  # Convex data subscription hooks
├── stores/                 # State management
├── lib/                    # Utilities (passkeys, etc.)
├── assets/                 # Icons, images, splash screens
└── docs/                   # Architecture documentation
```

## Tech Stack

- **Frontend**: React Native 0.81, Expo 54, TypeScript 5.9
- **Backend**: Convex (real-time database + serverless functions)
- **Authentication**: WebAuthn Passkeys (react-native-passkey + Turnkey SDK)
- **AI**: Dual LLM in Phala TEE (Brain + Soul) via elizaOS plugins
- **Card Issuing**: Marqeta JIT Funding
- **Payments**: Stripe for fiat funding
- **Crypto On-Ramp**: MoonPay for crypto purchases
- **Banking**: Stripe Treasury for virtual IBANs
- **Blockchain**: Solana (@solana/web3.js v1.98)
- **DEX Integration**: Jupiter (token data + swaps)
- **Order Flow**: DFlow protocol for MEV-protected trades
- **ZK Compression**: Light Protocol (compressed tokens + PDAs)
- **Smart Contracts**: Anchor Framework (Token-2022 hooks)

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Convex CLI (`npm install -g convex`)
- iOS Simulator or Android Emulator

### Installation

```bash
# Clone the repository
git clone https://github.com/Braze76/discard.git
cd discard

# Install dependencies
npm install

# Start Convex development server
npx convex dev

# In another terminal, start Expo
npm start
```

### Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
# Required
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Card Issuing (Marqeta)
MARQETA_BASE_URL=https://sandbox-api.marqeta.com/v3
MARQETA_APPLICATION_TOKEN=your_token
MARQETA_ACCESS_TOKEN=your_token

# Payments (Stripe)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# MoonPay (Crypto On-Ramp)
MOONPAY_API_KEY=pk_test_...
MOONPAY_SECRET_KEY=sk_test_...
MOONPAY_WEBHOOK_SECRET=your_secret

# Virtual IBAN
IBAN_PROVIDER=stripe_treasury

# AI (Anthropic)
ANTHROPIC_API_KEY=your_key

# Blockchain
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Convex Backend

### Schema (13 Tables)

| Table | Purpose |
|-------|---------|
| `users` | Passkey credentials, KYC status |
| `intents` | Command bar entries, AI parsing results |
| `cards` | Virtual cards with Marqeta tokens |
| `wallets` | Connected crypto wallets |
| `authorizations` | Payment authorizations |
| `authorizationHolds` | Reserved funds |
| `fraud` | Fraud analysis results |
| `defi` | DeFi positions for yield funding |
| `compliance` | KYC documents |
| `fundingTransactions` | Money movement records |
| `cryptoRates` | Cached crypto prices |
| `virtualIbans` | User-dedicated IBANs for bank deposits |
| `moonpayTransactions` | Crypto on-ramp transaction tracking |

### Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `expireHolds` | Every 5 min | Release expired authorization holds |
| `syncDefi` | Every 15 min | Sync DeFi positions |
| `syncRates` | Every 1 min | Update crypto prices |
| `selfHealingCheck` | Hourly | Check breach databases |
| `cleanupSessions` | Daily | Remove expired wallet sessions |
| `cleanupMetrics` | Weekly | Purge old fraud records |

### HTTP Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /webhooks/marqeta/authorization` | Marqeta JIT authorization (sub-800ms) |
| `POST /webhooks/marqeta/transactions` | Marqeta transaction events |
| `POST /webhooks/stripe` | Stripe payment webhooks |
| `POST /webhooks/moonpay` | MoonPay crypto purchase events |
| `POST /webhooks/iban` | Virtual IBAN deposit notifications |
| `GET /health` | Health check endpoint |

## Solana Programs

On-chain smart contracts built with Anchor Framework:

| Program | Purpose |
|---------|---------|
| `discard-state` | ZK-compressed card state using Light Protocol PDAs |
| `discard-hooks` | Token-2022 transfer hooks for policy enforcement |
| `merchant-registry` | On-chain merchant validation and whitelist management |

## External Services

Client integrations in `services/`:

| Service | Purpose |
|---------|---------|
| `jupiterTokensClient` | Token metadata, prices, and images from Jupiter API |
| `jupiterUltraClient` | DEX swap routing and execution |
| `dflowClient` | DFlow protocol for MEV-protected order flow |
| `dflowSwapClient` | Swap execution through DFlow auctions |
| `brainClient` | AI orchestrator communication |

## Scripts

```bash
# Development
npm start              # Start Expo
npx convex dev         # Start Convex dev server

# Testing
npm test               # Run Jest tests
npm run type-check     # TypeScript check

# Deployment
npx convex deploy      # Deploy Convex to production
```

## Intent Examples

The command bar understands natural language:

- "Create a card with $50 limit"
- "Fund my travel card with $100 from Aave"
- "Transfer $25 from shopping to groceries card"
- "Freeze my Amazon card"
- "What's my total balance across all cards?"
- "Top up $200 with MoonPay"
- "Show me my IBAN for bank transfers"
- "Buy $100 of ETH and add to my account"
- "Swap 50 USDC for SOL"
- "Show me trending tokens"

## Security

- **Passkeys**: Hardware-bound keys via Secure Enclave / StrongBox
- **No Passwords**: Biometric authentication only
- **Encryption**: All sensitive data encrypted at rest
- **Isolation**: Cryptographic card context prevents correlation
- **Real-time Monitoring**: Sub-second fraud detection

## License

MIT

## Links

- [Convex Dashboard](https://dashboard.convex.dev)
- [Expo Documentation](https://docs.expo.dev)
- [Marqeta Docs](https://www.marqeta.com/docs)
- [MoonPay Docs](https://docs.moonpay.com)
- [Stripe Treasury](https://stripe.com/docs/treasury)
- [Jupiter API](https://station.jup.ag/docs)
- [DFlow Protocol](https://docs.dflow.net)
- [Light Protocol](https://docs.lightprotocol.com)
- [Turnkey Docs](https://docs.turnkey.com)
- [Phala Network](https://docs.phala.network)
- [elizaOS](https://elizaos.github.io/eliza/)
