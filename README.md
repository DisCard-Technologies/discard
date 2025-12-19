# DisCard

> Intent-Centric Virtual Card Platform powered by Expo + Convex

DisCard is a mobile application that enables users to create disposable virtual debit cards funded with cryptocurrency. Natural language commands power an AI-driven interface where users simply describe what they want to do, and the system handles the complexity.

## Features

### Core Features
- **Intent-Centric UI**: Natural language command bar ("Fund my card with ETH yield")
- **Instant Card Creation**: Generate virtual debit cards in seconds
- **Crypto Funding**: Support for ETH, SOL, USDT, USDC, and major tokens
- **DeFi Integration**: Fund cards directly from yield-generating positions
- **Privacy-First**: Cards with cryptographic isolation, no cross-card correlation
- **Self-Healing Cards**: Automatic reissue when breach detected

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
├── App.tsx                 # Main app entry
├── convex/                 # Convex backend
│   ├── schema.ts           # Database schema (11 tables)
│   ├── auth/               # Passkey authentication
│   ├── cards/              # Card management + Marqeta
│   ├── funding/            # Stripe + crypto funding
│   ├── intents/            # AI intent processing (Claude)
│   ├── fraud/              # Fraud detection engine
│   ├── http/               # Webhook handlers
│   ├── crons/              # Scheduled jobs
│   └── migrations/         # Data migration tools
├── src/
│   ├── components/         # React Native components
│   │   └── command/        # Command bar UI
│   ├── hooks/              # Convex subscription hooks
│   ├── screens/            # App screens
│   ├── stores/             # State management (Convex-based)
│   ├── types/              # TypeScript definitions
│   └── lib/                # Utilities (passkeys, etc.)
├── assets/                 # Static assets
└── docs/                   # Documentation
```

## Tech Stack

- **Frontend**: React Native, Expo, TypeScript
- **Backend**: Convex (real-time database + serverless functions)
- **Authentication**: WebAuthn Passkeys (react-native-passkey)
- **AI**: Claude API for intent parsing
- **Card Issuing**: Marqeta JIT Funding
- **Payments**: Stripe for fiat funding
- **Blockchain**: Solana (via @solana/web3.js)

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

# AI (Anthropic)
ANTHROPIC_API_KEY=your_key

# Blockchain
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Convex Backend

### Schema (11 Tables)

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

- `POST /marqeta` - Marqeta authorization webhooks
- `POST /stripe` - Stripe payment webhooks

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
