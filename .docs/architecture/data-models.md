# Data Models

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
