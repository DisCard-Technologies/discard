# Simplified Project Structure

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
