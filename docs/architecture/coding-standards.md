# Coding Standards

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
