# Database Schema

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
