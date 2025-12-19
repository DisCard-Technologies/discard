# DisCard Data Migration: Supabase → Convex

## Overview

This directory contains migration scripts and documentation for moving DisCard data from Supabase (PostgreSQL) to Convex.

## Schema Mapping

The Convex "lean muscle" schema consolidates 50+ Supabase tables into 11 optimized tables:

| Convex Table | Supabase Source Tables |
|--------------|----------------------|
| `users` | users, user_verification_tokens, user_totp_secrets, user_backup_codes |
| `intents` | NEW (no Supabase equivalent) |
| `cards` | cards, visa_card_details, card_provisioning_status |
| `wallets` | crypto_wallets, wallet_sessions |
| `authorizations` | authorization_transactions |
| `authorizationHolds` | authorization_holds |
| `fraud` | fraud_events, fraud_detection_logs, fraud_ml_feedback |
| `defi` | defi_positions |
| `compliance` | kyc_records, compliance_events |
| `fundingTransactions` | funding_transactions, crypto_transactions, card_funding |
| `cryptoRates` | crypto_rates |

## Tables NOT Migrated (Deprecated)

These Supabase tables are not migrated as their functionality is handled differently in Convex:

- `transactions` → Replaced by `authorizations` real-time queries
- `account_balances` → Computed from cards/wallets in real-time
- `stripe_customers` → Stored in Stripe, linked by userId
- `stripe_webhook_events` → Convex handles idempotency internally
- `merchant_restrictions` → Embedded in cards table
- `currency_conversion_rates` → Fetched on-demand via API
- `decline_reason_codes` → Static config in code
- `network_status_log` → Replaced by Convex health checks
- `privacy_*` tables → Privacy settings embedded in users
- `compliance_*` tables → Simplified compliance in Convex
- `deletion_log` → Convex handles soft deletes

## Migration Steps

### 1. Export from Supabase

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-key"

# Run export script
npx ts-node convex/migrations/export-supabase.ts
```

### 2. Transform Data

```bash
# Transform exported data to Convex format
npx ts-node convex/migrations/transform-data.ts
```

### 3. Import to Convex

```bash
# Import transformed data
npx convex run migrations/importData:importAll
```

### 4. Verify Migration

```bash
# Run verification checks
npx convex run migrations/verify:runAll
```

## Data Transformation Rules

### Users
- `credentialId`: Generate new passkey or use placeholder for email-based accounts
- `publicKey`: Empty bytes until user re-authenticates with passkey
- `solanaAddress`: Derive from publicKey or leave null
- `kycStatus`: Map from Supabase kyc_status
- `privacySettings`: Extract from privacy_settings JSONB

### Cards
- `cardContext`: SHA-256 hash from card_context_hash
- `marqetaCardToken`: Direct copy from marqeta_card_token
- Balance fields: Convert from Supabase cents format
- Status mapping: `status` → Convex status enum

### Wallets
- `walletType`: Map from Supabase wallet_type enum
- `address`: Decrypt from wallet_address_encrypted
- Connection status: Map from connection_status

### Authorizations
- Copy from authorization_transactions
- Convert timestamps to Unix milliseconds

### Fraud
- Combine fraud_events + fraud_detection_logs
- Map risk factors to new schema

## Environment Variables

After migration, update `.env`:

```bash
# REMOVE (Supabase)
# SUPABASE_URL=
# SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_KEY=
# DATABASE_URL=
# REDIS_URL=

# KEEP (External services)
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
MARQETA_BASE_URL=...
MARQETA_APPLICATION_TOKEN=...
MARQETA_ACCESS_TOKEN=...
MARQETA_CARD_PRODUCT_TOKEN=...
MARQETA_WEBHOOK_SECRET=...
CLAUDE_API_KEY=...
SOLANA_RPC_URL=...

# ADD (Convex)
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

## Rollback Plan

1. Keep Supabase instance running for 30 days post-migration
2. Maintain read-only access for historical queries
3. Export Convex data back if needed via `convex export`

## Verification Checklist

- [ ] All users migrated with correct kycStatus
- [ ] All active cards have valid Marqeta tokens
- [ ] Card balances sum matches Supabase totals
- [ ] Wallet connections are functional
- [ ] Authorization history is complete
- [ ] Fraud detection continues working
- [ ] DeFi positions sync correctly
- [ ] Funding transactions reconcile
