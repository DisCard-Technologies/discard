# DisCard 🪪

> Privacy-first crypto-backed disposable virtual cards

DisCard is a mobile application that enables users to create disposable virtual debit cards funded with cryptocurrency. Users can instantly generate cards for one-time purchases, maintaining complete privacy and preventing fraud by never exposing their main wallet or real payment methods.

## 🚀 Features

- **Instant Card Creation**: Generate virtual debit cards in seconds
- **Crypto Funding**: Support for USDT, USDC, BTC, ETH, and major stablecoins
- **Privacy-First**: Cards auto-delete after use, no transaction history stored
- **WalletConnect Integration**: Seamless connection with existing crypto wallets
- **Fraud Prevention**: Disposable architecture prevents merchant overcharging
- **Smart Limits**: Set spending limits and merchant restrictions per card

## 🏗️ Architecture

```
DisCard/
├── frontend/          # React Native mobile app
├── backend/           # Node.js API services
├── contracts/         # Solidity smart contracts
├── infrastructure/    # Docker, K8s configs
├── docs/             # Architecture & API documentation
└── scripts/          # Deployment and utility scripts
```

## 🛠️ Tech Stack

- **Frontend**: React Native, WalletConnect, TypeScript
- **Backend**: Node.js, Express, PostgreSQL, Redis
- **Blockchain**: Solidity, Hardhat, OpenZeppelin
- **Card Issuing**: Marqeta API (or Stripe Issuing)
- **Off-Ramp**: MoonPay/Circle for USD conversion
- **Infrastructure**: Docker, GitHub Actions CI/CD

## 🚦 Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 14+
- Redis 7+
- Ethereum wallet for testing

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/[your-username]/discard.git
   cd discard
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install

   # Install frontend dependencies
   cd frontend && npm install

   # Install backend dependencies
   cd ../backend && npm install
   ```

3. **Environment setup**
   ```bash
   # Copy environment variables
   cp .env.example .env
   
   # Edit .env with your API keys
   # Required: WalletConnect, Marqeta/Stripe, Off-ramp provider
   ```

4. **Start services**
   ```bash
   # Start Docker services (PostgreSQL, Redis)
   docker-compose up -d

   # Run database migrations
   cd backend && npm run migrate

   # Start backend (separate terminal)
   npm run dev

   # Start frontend (separate terminal)
   cd frontend && npm start
   ```

5. **Deploy smart contracts (local)**
   ```bash
   cd contracts
   npx hardhat node  # Start local blockchain
   npx hardhat run scripts/deploy.js --network localhost
   ```

## 📋 Project Management

We use **Linear** for task management. Key workflows:

- Feature branches: `feature/[linear-ticket-id]-description`
- Bug fixes: `fix/[linear-ticket-id]-description`
- All PRs must reference Linear ticket

## 🔒 Security Considerations

- All card data is encrypted at rest
- Automatic data purging after card expiration
- No transaction history stored (privacy-first)
- Smart contract audits required before mainnet
- Rate limiting on all API endpoints
- Webhook signature verification

## 🧪 Testing

```bash
# Run all tests
npm test

# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# Smart contract tests
cd contracts && npx hardhat test
```

## 📚 API Documentation

API documentation is available at `http://localhost:3000/api-docs` when running locally.

Key endpoints:
- `POST /api/funding/create-card` - Create new disposable card
- `POST /api/funding/fund-card/:id` - Add funds to existing card
- `DELETE /api/funding/delete-card/:id` - Delete card and refund
- `GET /api/funding/card-status/:id` - Get card balance/status

## 🚀 Deployment

Production deployments are handled via GitHub Actions on merge to `main`.

```bash
# Manual deployment (staging)
./scripts/deploy-staging.sh

# Production requires approval
./scripts/deploy-production.sh
```

## 🤝 Contributing

1. Check Linear for available tasks
2. Create feature branch from `develop`
3. Make changes following our style guide
4. Write tests for new functionality
5. Submit PR with Linear ticket reference
6. Await code review

### Code Style

- ESLint configuration provided
- Prettier for formatting
- Commit convention: `type(scope): message [LINEAR-123]`

## 📄 License

[License Type] - see LICENSE file

## 🔗 Resources

- [Linear Board](https://linear.app/discard)
- [Figma Designs](https://figma.com/...)
- [Architecture Docs](./docs/architecture.md)
- [Smart Contract Docs](./contracts/README.md)

## 👥 Team

- **[Your Name]** - Product & Architecture
- **[Dev Partner]** - Engineering Lead

---

**Status**: 🟡 In Development

For questions, reach out in our internal Slack channel.