# MVP-Focused Tech Stack

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
