# DisCard 🪪

> Privacy-first crypto-backed disposable virtual cards

DisCard is a mobile application that enables users to create disposable virtual debit cards funded with cryptocurrency. Users can instantly generate cards for one-time purchases, maintaining complete privacy and preventing fraud by never exposing their main wallet or real payment methods.

## 🚀 Features

### Core Features
- **Instant Card Creation**: Generate virtual debit cards in seconds
- **Crypto Funding**: Support for USDT, USDC, BTC, ETH, and major stablecoins
- **Privacy-First**: Cards auto-delete after use, no transaction history stored
- **WalletConnect Integration**: Seamless connection with existing crypto wallets
- **Smart Limits**: Set spending limits and merchant restrictions per card

### 🔒 Advanced Security & Fraud Prevention
- **Real-time Fraud Detection**: <200ms transaction analysis with 5 anomaly detection algorithms
- **Automated Card Freezing**: Instant security response with Marqeta integration
- **Multi-Factor Authentication**: TOTP, biometric, and backup code support
- **Risk-based Authentication**: Dynamic security for high-value transactions
- **Comprehensive Security Dashboard**: Real-time security monitoring and controls

### 📋 Compliance & Regulatory
- **AML Monitoring**: Anti-Money Laundering with privacy preservation
- **KYC Integration**: Know Your Customer with minimal data collection
- **GDPR/CCPA Compliance**: Automated data protection and user rights management
- **Suspicious Activity Reporting**: Automated SAR generation and filing
- **7-Year Audit Trails**: Cryptographically secured compliance records

### 🔐 Transaction Isolation & Privacy
- **Database-level Isolation**: Complete transaction separation preventing correlation
- **Cryptographic Context Separation**: Enhanced privacy protection
- **Differential Privacy Analytics**: Aggregate reporting without individual exposure
- **Privacy Rights Management**: Data access, deletion, and portability controls

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
- **Security**: bcrypt, TOTP, Circuit Breakers, Rate Limiting
- **Privacy**: Differential Privacy, Cryptographic Isolation, Row-Level Security
- **Compliance**: AML/KYC Integration, GDPR/CCPA Automation, Audit Trail System
- **Blockchain**: Solidity, Hardhat, OpenZeppelin
- **Card Issuing**: Marqeta API (or Stripe Issuing)
- **Off-Ramp**: MoonPay/Circle for USD conversion
- **Monitoring**: Health Checks, Prometheus/StatsD Metrics, Operational Dashboards
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

### Data Protection
- All card data is encrypted at rest with bcrypt
- Automatic data purging after card expiration
- No transaction history stored (privacy-first)
- Database-level Row-Level Security (RLS) policies
- Cryptographic audit trails with tamper detection

### Fraud Prevention
- Real-time fraud detection with 5 anomaly algorithms
- Automated card freezing and security incident response
- Risk-based authentication for suspicious activities
- Velocity and pattern analysis for transaction monitoring

### Privacy Protection
- Transaction isolation preventing cross-card correlation
- Differential privacy for analytics without individual exposure
- Internal access controls preventing employee profiling
- GDPR/CCPA compliance with automated data rights management

### Infrastructure Security
- Multi-factor authentication (MFA) with TOTP and biometrics
- Rate limiting with sliding window algorithms
- Circuit breaker patterns for external service resilience
- Comprehensive input validation and sanitization
- Smart contract audits required before mainnet
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

### Core Card Endpoints
- `POST /api/funding/create-card` - Create new disposable card
- `POST /api/funding/fund-card/:id` - Add funds to existing card
- `DELETE /api/funding/delete-card/:id` - Delete card and refund
- `GET /api/funding/card-status/:id` - Get card balance/status

### Security & Fraud Prevention
- `GET /api/v1/security/fraud/status/:cardId` - Check fraud detection status
- `POST /api/v1/security/fraud/analyze` - Analyze transaction risk
- `POST /api/v1/security/cards/:cardId/freeze` - Freeze/unfreeze card manually
- `POST /api/v1/security/mfa/enroll` - Setup multi-factor authentication

### Compliance & Privacy
- `POST /api/v1/compliance/kyc` - Submit minimal KYC information
- `GET /api/v1/compliance/privacy-controls` - User privacy settings
- `DELETE /api/v1/compliance/user-data` - GDPR data deletion request
- `GET /api/v1/compliance/data-export` - Data portability export

### Privacy & Isolation
- `GET /api/v1/privacy/isolation/status` - Verify transaction isolation
- `GET /api/v1/analytics/private` - Privacy-preserving analytics
- `POST /api/v1/privacy/context/switch` - Switch isolation context

### Health & Monitoring
- `GET /health/basic` - Basic health check
- `GET /health/comprehensive` - Comprehensive system health
- `GET /health/readiness` - Kubernetes readiness probe
- `GET /health/liveness` - Kubernetes liveness probe

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

**Status**: 🟢 Production Ready - Enterprise Security & Compliance Enabled

For questions, reach out in our internal Slack channel.