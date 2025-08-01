# Unified Project Structure

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
