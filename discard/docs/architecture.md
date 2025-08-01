## Simplified Project Structure

```
discard-app/
├── .github/                    # CI/CD workflows
│   └── workflows/
│       ├── ci.yaml             # Test and build
│       └── deploy.yaml         # Railway deployment
├── apps/                       # Applications
│   ├── mobile/                 # Expo React Native app
│   │   ├── src/
│   │   │   ├── screens/        # App screens
│   │   │   │   ├── AuthScreen.tsx
│   │   │   │   ├── DashboardScreen.tsx
│   │   │   │   ├── CardCreateScreen.tsx
│   │   │   │   └── FundingScreen.tsx
│   │   │   ├── components/     # UI components
│   │   │   │   ├── CardComponent.tsx
│   │   │   │   ├── CryptoConverter.tsx
│   │   │   │   └── WalletConnect.tsx
│   │   │   ├── services/       # API services
│   │   │   │   ├── api.ts      # Main API client
│   │   │   │   ├── cards.ts    # Card operations
│   │   │   │   └── crypto.ts   # Crypto operations
│   │   │   ├── store/          # State management
│   │   │   │   ├── authStore.ts
│   │   │   │   ├── cardStore.ts
│   │   │   │   └── cryptoStore.ts
│   │   │   └── types/          # TypeScript types
│   │   ├── app.json            # Expo configuration
│   │   └── package.json
│   ├── web/                    # Turbo web application
│   │   ├── app/
│   │   │   ├── controllers/    # Turbo controllers
│   │   │   ├── views/          # HTML templates
│   │   │   └── assets/         # CSS and images
│   │   ├── config/
│   │   │   └── routes.rb       # URL routing
│   │   └── package.json
│   └── api/                    # Express.js backend
│       ├── src/
│       │   ├── routes/         # API routes
│       │   │   ├── auth.ts     # Authentication
│       │   │   ├── cards.ts    # Card management
│       │   │   ├── crypto.ts   # Crypto operations
│       │   │   └── webhooks.ts # External webhooks
│       │   ├── services/       # Business logic
│       │   │   ├── cardService.ts
│       │   │   ├── cryptoService.ts
│       │   │   ├── marqetaService.ts
│       │   │   └── moonpayService.ts
│       │   ├── middleware/     # Express middleware
│       │   │   ├── auth.ts     # JWT authentication
│       │   │   ├── validation.ts # Request validation
│       │   │   └── privacy.ts  # Privacy controls
│       │   ├── utils/          # Utilities
│       │   │   ├── supabase.ts # Database client
│       │   │   ├── redis.ts    # Cache client
│       │   │   └── crypto.ts   # Crypto utilities
│       │   └── app.ts          # Express app setup
│       ├── prisma/             # Database schema (optional)
│       └── package.json
├── packages/                   # Shared packages
│   ├── shared/                 # Shared types and utilities
│   │   ├── src/
│   │   │   ├── types/          # TypeScript interfaces
│   │   │   │   ├── api.ts      # API types
│   │   │   │   ├── card.ts     # Card types
│   │   │   │   └── crypto.ts   # Crypto types
│   │   │   └── utils/          # Shared utilities
│   │   │       ├── validation.ts
│   │   │       └── crypto.ts
│   │   └── package.json
│   ├── crypto/                 # Cryptocurrency utilities
│   │   ├── src/
│   │   │   ├── walletConnect.ts
│   │   │   ├── chainlink.ts
│   │   │   └── zeroX.ts
│   │   └── package.json
│   └── ui/                     # Shared UI components
│       ├── src/
│       │   ├── Card.tsx        # Card component
│       │   ├── Button.tsx      # Button component
│       │   └── Input.tsx       # Input component
│       └── package.json
├── contracts/                  # Smart contracts (if needed)
│   ├── contracts/
│   │   └── DisCardToken.sol    # Utility token contract
│   ├── scripts/
│   │   └── deploy.ts           # Deployment scripts
│   ├── test/
│   │   └── DisCardToken.test.ts
│   └── hardhat.config.ts
├── .env.example                # Environment template
├── turbo.json                  # Turbo configuration
├── package.json                # Root package.json
└── README.md
```

## Development Workflow

### Local Development Setup

#### Prerequisites

```bash
# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm (faster than npm/yarn)
npm install -g pnpm

# Install Turbo CLI
pnpm install -g turbo

# Install Expo CLI
pnpm install -g @expo/cli

# Install Railway CLI (for deployment)
npm install -g @railway/cli
```

#### Initial Setup

```bash
# Clone repository and install dependencies
git clone <repository-url> discard-app
cd discard-app
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Start Supabase local development (optional)
npx supabase start

# Run database migrations (if using Prisma)
pnpm db:migrate
```

#### Development Commands

```bash
# Start all apps in development
turbo dev

# Start individual apps
turbo dev --filter=mobile    # Expo development server
turbo dev --filter=web       # Turbo web server
turbo dev --filter=api       # Express API server

# Build all apps
turbo build

# Run tests
turbo test

# Deploy to Railway
railway up
```

### Environment Configuration

#### Required Environment Variables

```bash
# Backend (.env)
DATABASE_URL=your_supabase_database_url
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Redis
REDIS_URL=your_railway_redis_url

# External APIs
MARQETA_BASE_URL=https://sandbox-api.marqeta.com
MARQETA_APP_TOKEN=your_marqeta_app_token
MARQETA_ACCESS_TOKEN=your_marqeta_access_token

MOONPAY_API_KEY=your_moonpay_api_key
CIRCLE_API_KEY=your_circle_api_key

ALCHEMY_API_KEY=your_alchemy_api_key
CHAINLINK_RPC_URL=your_chainlink_rpc_url

FIREBLOCKS_API_KEY=your_fireblocks_api_key
FIREBLOCKS_PRIVATE_KEY=your_fireblocks_private_key

B2C2_API_KEY=your_b2c2_api_key

# Monitoring
SENTRY_DSN=your_sentry_dsn

# JWT
JWT_SECRET=your_jwt_secret_key

# Frontend (.env.local)
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

## Deployment Architecture

### Deployment Strategy

**Mobile Deployment:**
- **Platform:** Expo Application Services (EAS)
- **Build Command:** `expo build` for app store deployment
- **Distribution:** App Store and Google Play Store
- **Updates:** Over-the-air updates via Expo Updates

**Web Deployment:**
- **Platform:** Railway (or Vercel as alternative)
- **Build Command:** `turbo build --filter=web`
- **CDN:** Railway's built-in CDN
- **SSL:** Automatic HTTPS certificates

**Backend Deployment:**
- **Platform:** Railway
- **Build Command:** `turbo build --filter=api`
- **Deployment Method:** Git-based deployment with automatic builds
- **Database:** Supabase managed PostgreSQL
- **Cache:** Railway Redis addon

### CI/CD Pipeline

```yaml
name: DisCard MVP CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4# DisCard Fullstack Architecture Document

## Introduction

This document outlines the complete fullstack architecture for DisCard, including backend systems, frontend implementation, and their integration. It serves as the single source of truth for AI-driven development, ensuring consistency across the entire technology stack for the privacy-first disposable virtual crypto card platform.

This unified approach addresses the complex challenges of transaction isolation, multi-blockchain integration, payment processing, and cryptographic deletion while delivering a seamless user experience that makes privacy protection intuitive and empowering.

### Starter Template or Existing Project

**N/A - Greenfield Project**

This is a greenfield project building DisCard from scratch. No existing templates or codebases will be used as the foundation, allowing for optimal privacy-by-design architecture without legacy constraints.

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-01-31 | 1.0 | Initial fullstack architecture | Architect |

## High Level Architecture

## Simplified MVP Architecture

### Technical Summary

DisCard implements a streamlined architecture using Expo for mobile development, Express.js backend, and Supabase for managed database and authentication. The system leverages established fintech infrastructure (Marqeta for card issuing, MoonPay/Circle for crypto conversion) while maintaining privacy through careful API design and data isolation. Railway provides simple deployment and scaling, while specialized crypto infrastructure (Fireblocks, Alchemy, Chainlink) handles complex blockchain operations. This approach prioritizes speed-to-market while building on battle-tested financial infrastructure.

### Platform and Infrastructure Choice

**Platform:** Railway (Platform-as-a-Service)

**Key Services:** 
- Railway for backend deployment and scaling
- Supabase for database, auth, and real-time features
- Railway Redis for caching and session management
- Sentry for error tracking and performance monitoring
- GitHub Actions for CI/CD automation

**Deployment Host and Regions:** Railway's global edge network with primary deployment in US regions, automatic scaling and geographic distribution

### Repository Structure

**Structure:** Monorepo using Turbo

**Monorepo Tool:** Turbo 1.x with simple configuration and fast builds

**Package Organization:** 
- `apps/mobile` - Expo React Native app
- `apps/web` - Turbo web application  
- `apps/api` - Express.js backend
- `packages/shared` - Shared types and utilities
- `packages/crypto` - Cryptocurrency utilities
- `packages/ui` - Shared UI components

### High Level Architecture Diagram

```mermaid
graph TD
    U[Users] --> Mobile[Expo Mobile App]
    U --> Web[Turbo Web App]
    
    Mobile --> API[Express.js API]
    Web --> API
    
    API --> Supabase[(Supabase PostgreSQL)]
    API --> Redis[(Railway Redis)]
    API --> Auth[Supabase Auth]
    
    API --> Marqeta[Marqeta Card API]
    API --> MoonPay[MoonPay/Circle]
    API --> Alchemy[Alchemy Blockchain]
    API --> Chainlink[Chainlink Oracles]
    API --> ZeroX[0x DEX API]
    API --> Fireblocks[Fireblocks Custody]
    API --> B2C2[B2C2 Liquidity]
    
    API --> Railway[Railway Deployment]
    API --> Sentry[Sentry Monitoring]
```

### Architectural Patterns

- **Backend-as-a-Service (BaaS):** Leverage Supabase for database, auth, and real-time features - _Rationale:_ Eliminates infrastructure complexity while providing enterprise features out of the box

- **API-First Design:** Express.js backend with RESTful APIs consumed by multiple frontends - _Rationale:_ Simple, predictable architecture that's easy to develop and debug

- **Managed Services Strategy:** Use specialized providers for complex features (Marqeta for cards, Fireblocks for custody) - _Rationale:_ Avoid reinventing financial infrastructure, faster time-to-market

- **Privacy Through Isolation:** Logical data separation without complex cryptographic schemes - _Rationale:_ Simpler to implement and audit while maintaining user privacy

- **Event-Driven Webhooks:** Real-time updates through webhook integrations with external services - _Rationale:_ Reliable state synchronization with financial service providers

## MVP-Focused Tech Stack

This is the simplified, MVP-optimized technology selection designed for rapid development and deployment while maintaining core privacy and crypto functionality.

### Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|------------|---------|---------|-----------|
| **Mobile Framework** | Expo | 50.x | React Native development platform | Managed workflow, faster development, easy deployment |
| **Web Framework** | Turbo (Hotwire) | 8.x | Simple full-stack web framework | Minimal JavaScript, server-rendered, rapid development |
| **Language** | TypeScript | 5.3.3 | Type safety across stack | Prevents errors, better developer experience |
| **Backend Framework** | Express.js | 4.18.2 | Web application framework | Battle-tested, huge ecosystem, simple to learn |
| **Database** | Supabase (PostgreSQL) | Latest | Backend-as-a-Service with PostgreSQL | Managed database, built-in auth, real-time subscriptions |
| **Cache/Session** | Redis (via Railway) | 7.2.4 | Session storage and caching | High-performance caching for rates and sessions |
| **Deployment** | Railway | Latest | Platform-as-a-Service | Simple deployment, automatic scaling, reasonable pricing |
| **Authentication** | Supabase Auth | Latest | User authentication service | Built into Supabase, minimal setup required |
| **Card Processing** | Marqeta | Latest | Virtual card issuing platform | Used by Coinbase Card, crypto-friendly, robust APIs |
| **Crypto On-Ramp** | MoonPay | Latest | Crypto-to-fiat conversion | Established provider with good UX and compliance |
| **Stablecoin Rails** | Circle | Latest | USDC infrastructure | Direct stablecoin integration, enterprise-grade |
| **Blockchain Access** | Alchemy | Latest | Blockchain node provider | Reliable, fast, excellent developer tools |
| **Wallet Integration** | WalletConnect | 2.x | Multi-wallet connectivity | Standard for wallet connections, broad support |
| **Price Feeds** | Chainlink | Latest | Decentralized price oracles | Most reliable crypto price data, decentralized |
| **DEX Aggregation** | 0x API | Latest | Best crypto swap rates | Aggregates multiple DEXs for optimal rates |
| **Institutional Custody** | Fireblocks | Latest | Enterprise crypto custody | Bank-grade security, regulatory compliance |
| **OTC Liquidity** | B2C2 | Latest | Institutional liquidity | Large order execution without slippage |
| **Testing Framework** | Jest + Supertest | 29.7.0 | Unit and integration testing | Comprehensive testing for Node.js applications |
| **E2E Testing** | Expo Testing (Detox) | Latest | Mobile end-to-end testing | Integrated with Expo workflow |
| **Monorepo Tool** | Turbo | 1.x | Build system and task runner | Simple, fast, better than Nx for small teams |
| **Error Tracking** | Sentry | Latest | Error monitoring and performance | Essential for production debugging |
| **Smart Contracts** | Solidity + Hardhat + OpenZeppelin | Latest | Smart contract development | Industry standard for Ethereum development |
| **CI/CD** | GitHub Actions | Latest | Continuous integration | Free for public repos, integrates with Railway |
| **Styling** | Tailwind CSS | 3.4.x | Utility-first CSS framework | Rapid UI development, consistent design system |

## Data Models

### Core Data Models for Privacy-Preserving Card System

#### User Model

**Purpose:** Minimal user identity management with privacy-first data collection

**Key Attributes:**
- id: UUID - Primary identifier, never correlated with card data
- email: String (encrypted) - Minimal required for account recovery
- emailVerified: Boolean - Account verification status
- createdAt: Timestamp - Account creation for compliance aging
- lastActive: Timestamp - Session management, automatically expired

**Relationships:**
- **With Cards:** No direct relationship - isolation maintained through separate service contexts
- **With Compliance:** Minimal audit trail through separate compliance service

#### TypeScript Interface

```typescript
interface User {
  id: string; // UUID v4
  email: string; // Encrypted at rest
  emailVerified: boolean;
  createdAt: Date;
  lastActive: Date;
  privacySettings: {
    dataRetention: number; // Days
    analyticsOptOut: boolean;
  };
}
```

#### Card Model

**Purpose:** Disposable virtual card management with cryptographic isolation

**Key Attributes:**
- cardId: UUID - Unique card identifier, cryptographically isolated
- encryptedCardNumber: String - Card number encrypted with unique key
- encryptedCVV: String - CVV encrypted with card-specific key
- expirationDate: String - Card expiration (MMYY format)
- status: Enum - active|paused|expired|deleted
- spendingLimit: Number - Maximum allowed spend in cents
- currentBalance: Number - Available balance in cents

**Relationships:**
- **With User:** Isolated - no direct foreign key relationship
- **With Transactions:** One-to-many through card context isolation
- **With Crypto:** Funding relationships through separate service

#### TypeScript Interface

```typescript
interface Card {
  cardId: string; // UUID v4
  cardContext: string; // Cryptographic isolation key
  encryptedCardNumber: string; // AES-256 encrypted
  encryptedCVV: string; // AES-256 encrypted
  expirationDate: string; // MMYY
  status: 'active' | 'paused' | 'expired' | 'deleted';
  spendingLimit: number; // Cents
  currentBalance: number; // Cents
  createdAt: Date;
  expiresAt?: Date;
  merchantRestrictions?: string[]; // Category codes
  deletionKey: string; // Cryptographic deletion verification
}
```

#### CryptoTransaction Model

**Purpose:** Cryptocurrency funding transaction tracking with conversion details

**Key Attributes:**
- transactionId: UUID - Unique transaction identifier
- cryptoType: String - BTC|ETH|USDT|USDC|XRP
- cryptoAmount: Decimal - Original crypto amount
- usdAmount: Number - Converted USD amount in cents
- conversionRate: Decimal - Exchange rate at transaction time
- networkFee: Number - Blockchain network fee
- status: Enum - pending|confirmed|failed|expired

**Relationships:**
- **With Cards:** Through funding context, not direct foreign key
- **With Blockchain:** External transaction hash reference

#### TypeScript Interface

```typescript
interface CryptoTransaction {
  transactionId: string; // UUID v4
  cryptoType: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP';
  cryptoAmount: string; // Decimal string for precision
  usdAmount: number; // Cents
  conversionRate: string; // Decimal string
  networkFee: number; // Cents
  status: 'pending' | 'confirmed' | 'failed' | 'expired';
  blockchainTxHash?: string; // External reference
  createdAt: Date;
  confirmedAt?: Date;
  fundingContext: string; // Links to card without direct FK
}
```

#### PaymentTransaction Model

**Purpose:** Payment processing transaction records with minimal data retention

**Key Attributes:**
- transactionId: UUID - Unique payment identifier
- merchantName: String - Merchant identification
- amount: Number - Transaction amount in cents
- status: Enum - authorized|settled|declined|refunded
- authorizationCode: String - Payment network authorization
- processedAt: Timestamp - Transaction processing time

**Relationships:**
- **With Cards:** Through payment context isolation
- **With Compliance:** Minimal audit trail for regulatory requirements

#### TypeScript Interface

```typescript
interface PaymentTransaction {
  transactionId: string; // UUID v4
  merchantName: string; // Merchant identification
  merchantCategory: string; // MCC code
  amount: number; // Cents
  status: 'authorized' | 'settled' | 'declined' | 'refunded';
  authorizationCode: string; // Visa auth code
  processedAt: Date;
  cardContext: string; // Isolated card reference
  complianceRef?: string; // Minimal compliance data
}
```

## API Specification

### REST API Specification

```yaml
openapi: 3.0.0
info:
  title: DisCard Privacy-First Virtual Card API
  version: 1.0.0
  description: REST API for disposable virtual crypto card management with privacy-preserving architecture
servers:
  - url: https://api.discard.app/v1
    description: Production API Server
  - url: https://staging-api.discard.app/v1  
    description: Staging API Server

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    
  schemas:
    Card:
      type: object
      properties:
        cardId:
          type: string
          format: uuid
        status:
          type: string
          enum: [active, paused, expired, deleted]
        currentBalance:
          type: number
          description: Balance in cents
        spendingLimit:
          type: number
          description: Spending limit in cents
        expirationDate:
          type: string
          pattern: '^(0[1-9]|1[0-2])\/[0-9]{2}$'
        createdAt:
          type: string
          format: date-time
    
    CreateCardRequest:
      type: object
      required:
        - spendingLimit
      properties:
        spendingLimit:
          type: number
          minimum: 100
          maximum: 500000
        expirationDate:
          type: string
          pattern: '^(0[1-9]|1[0-2])\/[0-9]{2}$'
        merchantRestrictions:
          type: array
          items:
            type: string
    
    CryptoFundingRequest:
      type: object
      required:
        - cryptoType
        - cryptoAmount
        - cardId
      properties:
        cryptoType:
          type: string
          enum: [BTC, ETH, USDT, USDC, XRP]
        cryptoAmount:
          type: string
          pattern: '^[0-9]+\.[0-9]+$'
        cardId:
          type: string
          format: uuid
        slippageProtection:
          type: number
          minimum: 0.001
          maximum: 0.05

paths:
  /auth/login:
    post:
      summary: User authentication with minimal data collection
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - email
                - password
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  minLength: 8
      responses:
        '200':
          description: Authentication successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  accessToken:
                    type: string
                  refreshToken:
                    type: string
                  expiresIn:
                    type: number
        '401':
          description: Authentication failed
        '429':
          description: Rate limit exceeded

  /cards:
    post:
      summary: Create new disposable virtual card
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateCardRequest'
      responses:
        '201':
          description: Card created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Card'
                  - type: object
                    properties:
                      cardNumber:
                        type: string
                        description: Encrypted card number (temporary exposure)
                      cvv:
                        type: string
                        description: Card CVV (temporary exposure)
        '400':
          description: Invalid request parameters
        '403':
          description: Card creation limit exceeded
        '500':
          description: Card provisioning failed

    get:
      summary: List user's active cards (no cross-card correlation)
      security:
        - BearerAuth: []
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [active, paused, expired]
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 50
            default: 20
      responses:
        '200':
          description: Cards retrieved successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  cards:
                    type: array
                    items:
                      $ref: '#/components/schemas/Card'
                  total:
                    type: number

  /cards/{cardId}:
    get:
      summary: Get card details and transaction history
      security:
        - BearerAuth: []
      parameters:
        - name: cardId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Card details retrieved
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Card'
                  - type: object
                    properties:
                      transactions:
                        type: array
                        items:
                          type: object
                          properties:
                            transactionId:
                              type: string
                            merchantName:
                              type: string
                            amount:
                              type: number
                            status:
                              type: string
                            processedAt:
                              type: string
                              format: date-time
        '404':
          description: Card not found
        '403':
          description: Access denied

    delete:
      summary: Permanently delete disposable card with cryptographic verification
      security:
        - BearerAuth: []
      parameters:
        - name: cardId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Card deleted successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  deleted:
                    type: boolean
                  deletionProof:
                    type: string
                    description: Cryptographic proof of deletion
                  deletedAt:
                    type: string
                    format: date-time
        '404':
          description: Card not found
        '409':
          description: Card has pending transactions

  /crypto/rates:
    get:
      summary: Get real-time cryptocurrency conversion rates
      security:
        - BearerAuth: []
      parameters:
        - name: symbols
          in: query
          schema:
            type: string
            example: "BTC,ETH,USDT,USDC,XRP"
      responses:
        '200':
          description: Current rates retrieved
          content:
            application/json:
              schema:
                type: object
                properties:
                  rates:
                    type: object
                    additionalProperties:
                      type: object
                      properties:
                        usd:
                          type: number
                        change24h:
                          type: number
                        lastUpdated:
                          type: string
                          format: date-time
                  networkFees:
                    type: object
                    additionalProperties:
                      type: object
                      properties:
                        fast:
                          type: number
                        standard:
                          type: number
                        slow:
                          type: number

  /crypto/fund:
    post:
      summary: Fund card with cryptocurrency
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CryptoFundingRequest'
      responses:
        '202':
          description: Funding transaction initiated
          content:
            application/json:
              schema:
                type: object
                properties:
                  transactionId:
                    type: string
                    format: uuid
                  status:
                    type: string
                    enum: [pending]
                  expectedConfirmation:
                    type: string
                    format: date-time
                  depositAddress:
                    type: string
                  requiredConfirmations:
                    type: number
        '400':
          description: Invalid funding request
        '409':
          description: Rate changed, re-confirmation required

security:
  - BearerAuth: []
```

## Components

### Card Lifecycle Service

**Responsibility:** Manages complete disposable card lifecycle from creation through cryptographic deletion with privacy-preserving isolation

**Key Interfaces:**
- POST /cards - Create new disposable card with custom limits and restrictions
- DELETE /cards/{id} - Permanent deletion with cryptographic verification
- GET /cards/{id}/privacy-status - Real-time privacy protection verification

**Dependencies:** KMS for encryption keys, Visa API for card provisioning, Redis for session state

**Technology Stack:** Node.js with Fastify, PostgreSQL with row-level security, AWS KMS integration, cryptographic libraries for deletion verification

### Cryptocurrency Integration Service

**Responsibility:** Multi-blockchain integration with real-time conversion rates, wallet connectivity, and transaction monitoring across BTC, ETH, and ERC-20 tokens

**Key Interfaces:**
- GET /crypto/rates - Real-time conversion rates with slippage protection
- POST /crypto/fund - Initiate cryptocurrency funding with conversion
- GET /crypto/transactions/{id} - Monitor blockchain confirmation status

**Dependencies:** Blockchain node connections, exchange APIs for rates, wallet integration SDKs

**Technology Stack:** Node.js with Web3.js and BitcoinJS, Redis for rate caching, webhook handlers for blockchain events, multi-chain monitoring

### Payment Processing Service

**Responsibility:** Visa network integration for transaction authorization with real-time processing and fraud detection while maintaining privacy isolation

**Key Interfaces:**
- POST /payments/authorize - Process Visa authorization requests
- GET /payments/transactions - Retrieve card-specific transaction history
- POST /payments/dispute - Handle transaction disputes and chargebacks

**Dependencies:** Visa Direct API, fraud detection algorithms, transaction monitoring systems

**Technology Stack:** Node.js with payment SDK integration, PostgreSQL for transaction records, real-time event processing, secure API communication

### Privacy Protection Service

**Responsibility:** Enforces transaction isolation, manages cryptographic deletion, and provides privacy verification across all system components

**Key Interfaces:**
- GET /privacy/isolation-status - Verify transaction isolation effectiveness
- POST /privacy/verify-deletion - Cryptographic proof of data destruction
- GET /privacy/audit-trail - Privacy-compliant audit reporting

**Dependencies:** All other services for privacy enforcement, KMS for key management, audit logging systems

**Technology Stack:** Node.js with cryptographic libraries, AWS KMS integration, privacy-preserving analytics, compliance reporting tools

### Component Diagrams

```mermaid
graph TB
    subgraph "Frontend Layer"
        Mobile[React Native Mobile]
        Web[Next.js Web App]
    end
    
    subgraph "API Gateway Layer"
        Gateway[AWS API Gateway]
        Auth[Authentication Service]
    end
    
    subgraph "Core Services"
        CardSvc[Card Lifecycle Service]
        CryptoSvc[Cryptocurrency Service]
        PaymentSvc[Payment Processing Service]
        PrivacySvc[Privacy Protection Service]
        ComplianceSvc[Compliance Service]
    end
    
    subgraph "Data Layer"
        UserDB[(User Database)]
        CardDB[(Card Database)]
        CryptoDB[(Crypto Database)]
        PaymentDB[(Payment Database)]
        ComplianceDB[(Compliance Database)]
        Redis[(Redis Cache)]
    end
    
    subgraph "External Integrations"
        Visa[Visa Network]
        Blockchain[Blockchain Networks]
        KMS[AWS KMS]
    end
    
    Mobile --> Gateway
    Web --> Gateway
    Gateway --> Auth
    Gateway --> CardSvc
    Gateway --> CryptoSvc
    Gateway --> PaymentSvc
    Gateway --> PrivacySvc
    Gateway --> ComplianceSvc
    
    CardSvc --> CardDB
    CardSvc --> Redis
    CardSvc --> KMS
    CardSvc --> Visa
    
    CryptoSvc --> CryptoDB
    CryptoSvc --> Redis
    CryptoSvc --> Blockchain
    
    PaymentSvc --> PaymentDB
    PaymentSvc --> Visa
    PaymentSvc --> PrivacySvc
    
    PrivacySvc --> KMS
    PrivacySvc --> Redis
    
    Auth --> UserDB
    ComplianceSvc --> ComplianceDB
```

## External APIs

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

## Core Workflows

### Card Creation and Funding Workflow

```mermaid
sequenceDiagram
    participant User
    participant Mobile as Mobile App
    participant API as API Gateway
    participant Auth as Auth Service
    participant Card as Card Service
    participant Crypto as Crypto Service
    participant Visa as Visa Network
    participant KMS as AWS KMS
    
    User->>Mobile: Create new card
    Mobile->>API: POST /cards
    API->>Auth: Validate JWT token
    Auth-->>API: Token valid
    
    API->>Card: Create card request
    Card->>KMS: Generate encryption keys
    KMS-->>Card: Card keys created
    Card->>Visa: Provision virtual card
    Visa-->>Card: Card details (number, CVV)
    Card->>Card: Encrypt card details
    Card-->>API: Card created (encrypted)
    API-->>Mobile: Card ID and encrypted details
    
    User->>Mobile: Fund card with crypto
    Mobile->>API: POST /crypto/fund
    API->>Crypto: Initiate funding
    Crypto->>Crypto: Generate deposit address
    Crypto-->>API: Deposit address
    API-->>Mobile: Funding initiated
    
    Note over Crypto: User sends crypto to address
    Crypto->>Crypto: Monitor blockchain
    Crypto->>Card: Credit card balance
    Card->>Mobile: Push notification (funded)
```

### Privacy-Preserving Transaction Processing

```mermaid
sequenceDiagram
    participant Merchant
    participant Visa as Visa Network
    participant Payment as Payment Service
    participant Card as Card Service
    participant Privacy as Privacy Service
    participant User
    
    Merchant->>Visa: Authorization request
    Visa->>Payment: Forward authorization
    Payment->>Privacy: Check isolation context
    Privacy-->>Payment: Context validated
    
    Payment->>Card: Validate card and balance
    Card-->>Payment: Authorization approved
    Payment->>Privacy: Log transaction (isolated)
    Privacy-->>Payment: Privacy confirmed
    
    Payment-->>Visa: Authorization approved
    Visa-->>Merchant: Transaction authorized
    
    Payment->>User: Push notification
    Payment->>Payment: Update card balance
    
    Note over Privacy: No cross-card correlation possible
```

## Database Schema

### Privacy-Preserving Database Design

```sql
-- User table with minimal data collection
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_encrypted TEXT NOT NULL,
    email_hash TEXT UNIQUE NOT NULL, -- For lookup only
    password_hash TEXT NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    privacy_settings JSONB DEFAULT '{"dataRetention": 365, "analyticsOptOut": true}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Card table with cryptographic isolation
CREATE TABLE cards (
    card_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context_hash TEXT NOT NULL, -- Cryptographic isolation key
    encrypted_card_number TEXT NOT NULL,
    encrypted_cvv TEXT NOT NULL,
    expiration_date TEXT NOT NULL, -- MMYY format
    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'expired', 'deleted')),
    spending_limit INTEGER NOT NULL, -- Cents
    current_balance INTEGER NOT NULL DEFAULT 0, -- Cents
    merchant_restrictions TEXT[], -- MCC codes
    encryption_key_id TEXT NOT NULL, -- KMS key reference
    deletion_key TEXT, -- For cryptographic deletion proof
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Crypto transactions with funding context isolation
CREATE TABLE crypto_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crypto_type TEXT NOT NULL CHECK (crypto_type IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP')),
    crypto_amount DECIMAL(20,8) NOT NULL,
    usd_amount INTEGER NOT NULL, -- Cents
    conversion_rate DECIMAL(20,8) NOT NULL,
    network_fee INTEGER NOT NULL, -- Cents
    status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed', 'expired')),
    blockchain_tx_hash TEXT,
    funding_context_hash TEXT NOT NULL, -- Links to card without FK
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE
);

-- Payment transactions with minimal data retention
CREATE TABLE payment_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_name TEXT NOT NULL,
    merchant_category TEXT NOT NULL, -- MCC code
    amount INTEGER NOT NULL, -- Cents
    status TEXT NOT NULL CHECK (status IN ('authorized', 'settled', 'declined', 'refunded')),
    authorization_code TEXT,
    card_context_hash TEXT NOT NULL, -- Isolated card reference
    compliance_ref TEXT, -- Minimal compliance data
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at TIMESTAMP WITH TIME ZONE
);

-- Compliance audit table with privacy preservation
CREATE TABLE compliance_audit (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    event_context_hash TEXT NOT NULL, -- No direct user/card reference
    compliance_data JSONB, -- Minimal required data only
    retention_until TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Privacy deletion log for cryptographic verification
CREATE TABLE deletion_log (
    deletion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_hash TEXT NOT NULL,
    deletion_proof TEXT NOT NULL, -- Cryptographic proof
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verification_hash TEXT NOT NULL
);

-- Indexes for performance with privacy considerations
CREATE INDEX idx_cards_context_hash ON cards(card_context_hash);
CREATE INDEX idx_cards_status ON cards(status) WHERE status != 'deleted';
CREATE INDEX idx_crypto_funding_context ON crypto_transactions(funding_context_hash);
CREATE INDEX idx_payment_card_context ON payment_transactions(card_context_hash);
CREATE INDEX idx_compliance_retention ON compliance_audit(retention_until);

-- Row Level Security for data isolation
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies prevent cross-context data access
CREATE POLICY card_isolation ON cards
    FOR ALL
    USING (card_context_hash = current_setting('app.card_context', true));

CREATE POLICY crypto_isolation ON crypto_transactions
    FOR ALL
    USING (funding_context_hash = current_setting('app.card_context', true));

CREATE POLICY payment_isolation ON payment_transactions
    FOR ALL
    USING (card_context_hash = current_setting('app.card_context', true));
```

## Unified Project Structure

```
discard-monorepo/
├── .github/                    # CI/CD workflows and templates
│   └── workflows/
│       ├── ci.yaml             # Continuous integration
│       ├── deploy-staging.yaml # Staging deployment
│       └── deploy-prod.yaml    # Production deployment
├── apps/                       # Application packages
│   ├── mobile/                 # React Native application
│   │   ├── src/
│   │   │   ├── components/     # Reusable UI components
│   │   │   │   ├── cards/      # Card-specific components
│   │   │   │   ├── crypto/     # Crypto funding components
│   │   │   │   └── privacy/    # Privacy indicator components
│   │   │   ├── screens/        # Main app screens
│   │   │   │   ├── auth/       # Authentication screens
│   │   │   │   ├── dashboard/  # Main dashboard
│   │   │   │   ├── cards/      # Card management screens
│   │   │   │   └── funding/    # Crypto funding screens
│   │   │   ├── services/       # API client services
│   │   │   │   ├── api.ts      # Main API client
│   │   │   │   ├── auth.ts     # Authentication service
│   │   │   │   └── crypto.ts   # Cryptocurrency service
│   │   │   ├── stores/         # Zustand state management
│   │   │   │   ├── auth.ts     # Authentication state
│   │   │   │   ├── cards.ts    # Card management state
│   │   │   │   └── crypto.ts   # Crypto rates and funding
│   │   │   ├── utils/          # Utility functions
│   │   │   │   ├── crypto.ts   # Crypto calculations
│   │   │   │   ├── privacy.ts  # Privacy utilities
│   │   │   │   └── validation.ts # Input validation
│   │   │   └── types/          # TypeScript type definitions
│   │   ├── __tests__/          # Mobile app tests
│   │   └── package.json
│   ├── web/                    # Next.js web application
│   │   ├── src/
│   │   │   ├── app/            # Next.js 14 app router
│   │   │   │   ├── auth/       # Authentication pages
│   │   │   │   ├── dashboard/  # Dashboard pages
│   │   │   │   └── api/        # API routes (optional)
│   │   │   ├── components/     # React components
│   │   │   │   ├── cards/      # Card management UI
│   │   │   │   ├── crypto/     # Crypto funding UI
│   │   │   │   └── layout/     # Layout components
│   │   │   ├── services/       # API services (shared with mobile)
│   │   │   ├── stores/         # State management
│   │   │   └── styles/         # Global styles and themes
│   │   ├── public/             # Static assets
│   │   └── package.json
│   └── api/                    # Backend services
│       ├── src/
│       │   ├── services/       # Microservices
│       │   │   ├── auth/       # Authentication service
│       │   │   │   ├── auth.controller.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   └── auth.routes.ts
│       │   │   ├── cards/      # Card lifecycle service
│       │   │   │   ├── cards.controller.ts
│       │   │   │   ├── cards.service.ts
│       │   │   │   └── privacy.service.ts
│       │   │   ├── crypto/     # Cryptocurrency service
│       │   │   │   ├── crypto.controller.ts
│       │   │   │   ├── blockchain.service.ts
│       │   │   │   └── rates.service.ts
│       │   │   ├── payments/   # Payment processing service
│       │   │   │   ├── payments.controller.ts
│       │   │   │   ├── visa.service.ts
│       │   │   │   └── authorization.service.ts
│       │   │   └── compliance/ # Compliance and audit service
│       │   │       ├── compliance.controller.ts
│       │   │       ├── audit.service.ts
│       │   │       └── reporting.service.ts
│       │   ├── middleware/      # Express/Fastify middleware
│       │   │   ├── auth.middleware.ts
│       │   │   ├── privacy.middleware.ts
│       │   │   └── validation.middleware.ts
│       │   ├── database/        # Database configuration
│       │   │   ├── migrations/  # Database migrations
│       │   │   ├── seeds/       # Seed data for development
│       │   │   └── connection.ts
│       │   ├── utils/           # Backend utilities
│       │   │   ├── crypto.util.ts
│       │   │   ├── privacy.util.ts
│       │   │   └── validation.util.ts
│       │   └── app.ts           # Main application entry
│       ├── tests/               # Backend integration tests
│       └── package.json
├── packages/                    # Shared packages
│   ├── shared/                  # Shared types and utilities
│   │   ├── src/
│   │   │   ├── types/           # TypeScript interfaces
│   │   │   │   ├── api.ts       # API request/response types
│   │   │   │   ├── card.ts      # Card-related types
│   │   │   │   ├── crypto.ts    # Cryptocurrency types
│   │   │   │   └── user.ts      # User types
│   │   │   ├── constants/       # Shared constants
│   │   │   │   ├── crypto.ts    # Crypto constants
│   │   │   │   └── privacy.ts   # Privacy settings
│   │   │   └── utils/           # Shared utility functions
│   │   │       ├── crypto.ts    # Crypto calculations
│   │   │       ├── privacy.ts   # Privacy utilities
│   │   │       └── validation.ts # Validation helpers
│   │   └── package.json
│   ├── ui/                      # Shared UI components
│   │   ├── src/
│   │   │   ├── components/      # Reusable components
│   │   │   │   ├── Card/        # Card component variants
│   │   │   │   ├── Privacy/     # Privacy indicators
│   │   │   │   └── Crypto/      # Crypto-related components
│   │   │   ├── themes/          # Design system themes
│   │   │   └── hooks/           # Shared React hooks
│   │   └── package.json
│   └── config/                  # Shared configuration
│       ├── eslint/              # ESLint configurations
│       ├── typescript/          # TypeScript configurations
│       └── jest/                # Jest testing configurations
├── infrastructure/              # AWS CDK infrastructure code
│   ├── lib/
│   │   ├── api-stack.ts         # API Gateway and services
│   │   ├── database-stack.ts    # RDS and Redis
│   │   ├── monitoring-stack.ts  # CloudWatch and alerts
│   │   └── security-stack.ts    # KMS and security groups
│   ├── bin/
│   │   └── infrastructure.ts    # CDK app entry point
│   └── package.json
├── scripts/                     # Build and deployment scripts
│   ├── build.sh                 # Build all applications
│   ├── deploy.sh                # Deployment automation
│   └── test.sh                  # Run all tests
├── docs/                        # Project documentation
│   ├── prd.md                   # Product Requirements Document
│   ├── front-end-spec.md        # UI/UX Specification
│   └── fullstack-architecture.md # This architecture document
├── .env.example                 # Environment variable template
├── package.json                 # Root package.json with workspaces
├── nx.json                      # Nx workspace configuration
└── README.md                    # Project overview and setup
```

## Development Workflow

### Local Development Setup

#### Prerequisites

```bash
# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Yarn for package management
npm install -g yarn

# Install Nx CLI globally
npm install -g nx@17.2.8

# Install React Native development tools
npm install -g @react-native-community/cli
npm install -g react-native-debugger

# Install Docker for local services
sudo apt-get install docker.io docker-compose

# Install AWS CLI for infrastructure management
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install
```

#### Initial Setup

```bash
# Clone repository and install dependencies
git clone <repository-url> discard-app
cd discard-app
yarn install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with development configuration

# Start local services (PostgreSQL, Redis)
docker-compose up -d

# Run database migrations
nx run api:migrate

# Seed development data
nx run api:seed
```

#### Development Commands

```bash
# Start all services in development mode
nx run-many --target=serve --projects=mobile,web,api --parallel

# Start individual services
nx serve mobile          # React Native with Metro bundler
nx serve web            # Next.js development server
nx serve api            # Backend API with hot reload

# Run all tests
nx run-many --target=test --all

# Run specific test suites
nx test mobile          # Mobile app unit tests
nx test api            # Backend integration tests
nx run mobile:e2e      # End-to-end mobile tests
```

### Environment Configuration

#### Required Environment Variables

```bash
# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WEB3_PROVIDER_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_BITCOIN_NETWORK=testnet
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn

# Backend (.env)
DATABASE_URL=postgresql://discard:password@localhost:5432/discard_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_key
AWS_KMS_KEY_ID=your_kms_key_id
VISA_API_KEY=your_visa_api_key
VISA_API_SECRET=your_visa_api_secret
ALCHEMY_API_KEY=your_alchemy_api_key
COINGECKO_API_KEY=your_coingecko_api_key

# Shared
NODE_ENV=development
LOG_LEVEL=debug
PRIVACY_MODE=strict
```

## Deployment Architecture

### Deployment Strategy

**Frontend Deployment:**
- **Platform:** Vercel (web), AWS S3 + CloudFront (mobile web fallback)
- **Build Command:** `nx build web` for Next.js optimization
- **Output Directory:** `dist/apps/web/`
- **CDN/Edge:** Global CDN with edge caching for static assets and API responses

**Backend Deployment:**
- **Platform:** AWS ECS Fargate with Application Load Balancer
- **Build Command:** `nx build api` with Docker containerization
- **Deployment Method:** Blue-green deployment with health checks and automatic rollback

### CI/CD Pipeline

```yaml
name: DisCard CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'
      
      - name: Install dependencies
        run: yarn install --frozen-lockfile
      
      - name: Lint and type check
        run: |
          nx run-many --target=lint --all
          nx run-many --target=type-check --all
      
      - name: Run tests
        run: |
          nx run-many --target=test --all --coverage
          nx run mobile:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/discard_test
          REDIS_URL: redis://localhost:6379

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: |
          nx build api
          aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker build -t $ECR_REGISTRY/discard-api:staging .
          docker push $ECR_REGISTRY/discard-api:staging
          aws ecs update-service --cluster discard-staging --service api --force-new-deployment

  deploy-production:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          nx build api
          nx build web
          # Deploy web to Vercel
          vercel --prod --token $VERCEL_TOKEN
          # Deploy API to production ECS
          aws ecs update-service --cluster discard-prod --service api --force-new-deployment
```

### Environments

| Environment | Frontend URL | Backend URL | Purpose |
|-------------|--------------|-------------|---------|
| Development | http://localhost:3000 | http://localhost:3001 | Local development and testing |
| Staging | https://staging.discard.app | https://staging-api.discard.app | Pre-production testing and validation |
| Production | https://discard.app | https://api.discard.app | Live customer-facing environment |

## Security and Performance

### Security Requirements

**Frontend Security:**
- CSP Headers: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`
- XSS Prevention: React Native's built-in protections + input sanitization
- Secure Storage: iOS Keychain and Android Keystore for sensitive data

**Backend Security:**
- Input Validation: JSON schema validation on all API endpoints with sanitization
- Rate Limiting: 100 requests per minute per IP, 1000 requests per hour per authenticated user
- CORS Policy: Restricted to frontend domains with credential support

**Authentication Security:**
- Token Storage: Secure storage in mobile keychain, httpOnly cookies on web
- Session Management: JWT with 15-minute access tokens, 7-day refresh tokens
- Password Policy: Minimum 8 characters with complexity requirements and breach detection

### Performance Optimization

**Frontend Performance:**
- Bundle Size Target: <2MB total bundle size for mobile, <1MB initial web bundle
- Loading Strategy: Lazy loading for screens, progressive image loading, prefetch critical data
- Caching Strategy: React Query for API caching, AsyncStorage for offline data

**Backend Performance:**
- Response Time Target: <200ms for card operations, <100ms for balance checks
- Database Optimization: Connection pooling, query optimization, proper indexing
- Caching Strategy: Redis for session data, API response caching, rate data caching

## Testing Strategy

### Testing Pyramid

```
                  E2E Tests (Detox)
                 /              \
        API Integration Tests (Jest)
               /                    \
    Frontend Unit Tests    Backend Unit Tests
         (Jest + RTL)          (Jest + Supertest)
```

### Test Organization

#### Frontend Tests

```
apps/mobile/__tests__/
├── components/           # Component unit tests
│   ├── Card.test.tsx    # Card component testing
│   └── Privacy.test.tsx # Privacy indicator testing
├── screens/             # Screen integration tests
│   ├── Dashboard.test.tsx
│   └── CardCreation.test.tsx
├── services/            # API service testing
│   ├── api.test.ts
│   └── crypto.test.ts
└── e2e/                 # End-to-end tests
    ├── card-creation.e2e.ts
    └── privacy-flows.e2e.ts
```

#### Backend Tests

```
apps/api/tests/
├── unit/                # Unit tests
│   ├── services/
│   │   ├── cards.service.test.ts
│   │   └── crypto.service.test.ts
│   └── utils/
│       └── privacy.util.test.ts
├── integration/         # Integration tests
│   ├── auth.integration.test.ts
│   ├── cards.integration.test.ts
│   └── payments.integration.test.ts
└── fixtures/            # Test data and mocks
    ├── cards.fixture.ts
    └── users.fixture.ts
```

### Test Examples

#### Frontend Component Test

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CardComponent } from '../Card';
import { mockCard } from '../../__fixtures__/card.fixture';

describe('CardComponent', () => {
  it('should display card with privacy indicator', () => {
    const { getByText, getByTestId } = render(
      <CardComponent card={mockCard} />
    );
    
    expect(getByText('****1234')).toBeTruthy();
    expect(getByTestId('privacy-indicator')).toBeTruthy();
    expect(getByTestId('privacy-indicator')).toHaveProps({
      status: 'active'
    });
  });

  it('should handle card deletion with confirmation', async () => {
    const onDelete = jest.fn();
    const { getByText } = render(
      <CardComponent card={mockCard} onDelete={onDelete} />
    );
    
    fireEvent.press(getByText('Delete Card'));
    fireEvent.press(getByText('Confirm Deletion'));
    
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(mockCard.cardId);
    });
  });
});
```

#### Backend API Test

```typescript
import request from 'supertest';
import { app } from '../../../src/app';
import { createTestCard, cleanupTestData } from '../../fixtures/cards.fixture';

describe('Cards API', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  describe('POST /cards', () => {
    it('should create new disposable card with privacy isolation', async () => {
      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', 'Bearer valid_jwt_token')
        .send({
          spendingLimit: 50000, // $500.00
          expirationDate: '12/26'
        })
        .expect(201);

      expect(response.body).toMatchObject({
        cardId: expect.any(String),
        status: 'active',
        spendingLimit: 50000,
        currentBalance: 0
      });

      // Verify privacy isolation
      expect(response.body.cardNumber).toMatch(/^\d{16}$/);
      expect(response.body.cvv).toMatch(/^\d{3}$/);
    });

    it('should enforce spending limits', async () => {
      await request(app)
        .post('/api/v1/cards')
        .set('Authorization', 'Bearer valid_jwt_token')
        .send({
          spendingLimit: 50, // Too low
        })
        .expect(400);
    });
  });

  describe('DELETE /cards/:cardId', () => {
    it('should permanently delete card with cryptographic verification', async () => {
      const card = await createTestCard();

      const response = await request(app)
        .delete(`/api/v1/cards/${card.cardId}`)
        .set('Authorization', 'Bearer valid_jwt_token')
        .expect(200);

      expect(response.body).toMatchObject({
        deleted: true,
        deletionProof: expect.any(String),
        deletedAt: expect.any(String)
      });

      // Verify card is completely inaccessible
      await request(app)
        .get(`/api/v1/cards/${card.cardId}`)
        .set('Authorization', 'Bearer valid_jwt_token')
        .expect(404);
    });
  });
});
```

## Coding Standards

### Critical Fullstack Rules

- **Type Safety Everywhere:** All API contracts must use shared TypeScript interfaces from packages/shared, no any types allowed in production code
- **Privacy by Default:** All database queries must use row-level security contexts, never query across card contexts
- **Secure Data Handling:** Sensitive data (card numbers, crypto addresses) must be encrypted at rest and in transit, never logged in plaintext
- **Error Boundary Pattern:** All React components must handle errors gracefully without exposing sensitive information
- **Cryptographic Deletion:** All card-related data must be tied to KMS keys that can be permanently destroyed for verified deletion

### Naming Conventions

| Element | Frontend | Backend | Example |
|---------|----------|---------|---------|
| Components | PascalCase | - | `CardCreationScreen.tsx` |
| Hooks | camelCase with 'use' | - | `useCardManagement.ts` |
| API Routes | - | kebab-case | `/api/v1/crypto-rates` |
| Database Tables | - | snake_case | `payment_transactions` |
| Environment Variables | SCREAMING_SNAKE_CASE | SCREAMING_SNAKE_CASE | `VISA_API_KEY` |

## Error Handling Strategy

### Unified Error Flow

```mermaid
sequenceDiagram
    participant Frontend
    participant API as API Gateway
    participant Service
    participant Database
    participant External as External API
    
    Frontend->>API: Request with invalid data
    API->>API: Validation error
    API-->>Frontend: 400 Bad Request + Error details
    
    Frontend->>API: Valid request
    API->>Service: Process request
    Service->>External: External API call
    External-->>Service: Service unavailable
    Service->>Service: Retry with backoff
    Service-->>API: 503 Service temporarily unavailable
    API-->>Frontend: 503 + Retry guidance
    
    Frontend->>API: Valid request
    API->>Service: Process request
    Service->>Database: Database operation
    Database-->>Service: Connection timeout
    Service->>Service: Log error + Generate correlation ID
    Service-->>API: 500 Internal server error
    API-->>Frontend: 500 + Correlation ID (no sensitive details)
```

### Error Response Format

```typescript
interface ApiError {
  error: {
    code: string;           // Machine-readable error code
    message: string;        // User-friendly error message
    details?: Record<string, any>; // Additional context (non-sensitive)
    timestamp: string;      // ISO 8601 timestamp
    correlationId: string;  // For support troubleshooting
    retryable?: boolean;    // Whether client should retry
  };
}
```

### Frontend Error Handling

```typescript
// Global error boundary for React components
export class ErrorBoundary extends React.Component<Props, State> {
  static getDerivedStateFromError(error: Error): State {
    // Never expose sensitive information in error UI
    return {
      hasError: true,
      errorId: generateErrorId(),
      userMessage: 'Something went wrong. Please try again.'
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to privacy-compliant error tracking
    logError(error, {
      ...errorInfo,
      sensitive: false, // Never log sensitive data
      userId: getCurrentUserId(), // Only if consent given
    });
  }
}

// API error handling with retry logic
export const apiClient = {
  async request<T>(config: RequestConfig): Promise<T> {
    try {
      return await this.executeRequest<T>(config);
    } catch (error) {
      if (error.status === 401) {
        // Handle authentication errors
        await this.refreshToken();
        return this.executeRequest<T>(config);
      } else if (error.status >= 500 && config.retryable !== false) {
        // Retry server errors with exponential backoff
        return this.retryRequest<T>(config);
      }
      throw this.normalizeError(error);
    }
  }
};
```

### Backend Error Handling

```typescript
// Global error handler middleware
export const errorHandler = (
  error: Error,
  req: FastifyRequest,
  reply: FastifyReply,
  next: any
) => {
  const correlationId = req.headers['x-correlation-id'] || generateId();
  
  // Log error with privacy protections
  logger.error('Request failed', {
    correlationId,
    error: error.message,
    stack: error.stack,
    path: req.url,
    method: req.method,
    // Never log sensitive request data
    sensitive: false
  });

  // Determine appropriate user-facing error
  if (error instanceof ValidationError) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.details, // Safe validation details only
        timestamp: new Date().toISOString(),
        correlationId
      }
    });
  } else if (error instanceof AuthenticationError) {
    reply.status(401).send({
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
        timestamp: new Date().toISOString(),
        correlationId
      }
    });
  } else {
    // Generic server error - never expose internal details
    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        correlationId,
        retryable: true
      }
    });
  }
};
```

## Monitoring and Observability

### Monitoring Stack

- **Frontend Monitoring:** Sentry for React Native and Next.js error tracking with privacy-compliant data collection
- **Backend Monitoring:** AWS CloudWatch for infrastructure metrics + Datadog for application performance monitoring
- **Error Tracking:** Sentry with PII filtering and privacy-compliant error aggregation
- **Performance Monitoring:** New Relic for detailed performance insights with user privacy protection

### Key Metrics

**Frontend Metrics:**
- App crash rate by platform and version
- Screen load times and user interaction responsiveness
- API response times from client perspective
- Privacy feature usage and effectiveness metrics

**Backend Metrics:**
- API response times by endpoint (P50, P95, P99)
- Error rates by service and endpoint
- Database query performance and connection pool utilization
- Cryptocurrency rate update latency and accuracy
- Card creation and deletion success rates
- Privacy isolation verification metrics

## Checklist Results Report

*To be populated after running architect-checklist validation*