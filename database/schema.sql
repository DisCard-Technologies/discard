-- DisCard Database Schema
-- Supabase PostgreSQL Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Users table
CREATE TABLE users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_verified BOOLEAN DEFAULT FALSE,
    kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'approved', 'rejected')),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Cards table
CREATE TABLE cards (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_number_encrypted TEXT NOT NULL,
    card_type VARCHAR(20) NOT NULL CHECK (card_type IN ('virtual', 'physical')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'cancelled')),
    balance_usd DECIMAL(15,2) DEFAULT 0.00,
    spending_limit_daily DECIMAL(15,2) DEFAULT 1000.00,
    spending_limit_monthly DECIMAL(15,2) DEFAULT 10000.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Transactions table
CREATE TABLE transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    amount_usd DECIMAL(15,2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    merchant_name VARCHAR(255),
    merchant_category VARCHAR(100),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'refund', 'fee')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Funding sources table
CREATE TABLE funding_sources (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('crypto_wallet', 'bank_account', 'crypto_exchange')),
    source_identifier VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Card funding table (tracks crypto-to-USD conversions)
CREATE TABLE card_funding (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    funding_source_id UUID NOT NULL REFERENCES funding_sources(id) ON DELETE CASCADE,
    amount_usd DECIMAL(15,2) NOT NULL,
    crypto_currency VARCHAR(10) NOT NULL,
    crypto_amount DECIMAL(20,8) NOT NULL,
    exchange_rate DECIMAL(20,8) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_cards_user_id ON cards(user_id);
CREATE INDEX idx_cards_status ON cards(status);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_card_id ON transactions(card_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_funding_sources_user_id ON funding_sources(user_id);
CREATE INDEX idx_card_funding_card_id ON card_funding(card_id);
CREATE INDEX idx_card_funding_status ON card_funding(status);

-- Row Level Security Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_funding ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own cards" ON cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own cards" ON cards FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own funding sources" ON funding_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own funding sources" ON funding_sources FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own card funding" ON card_funding 
FOR SELECT USING (auth.uid() = (SELECT user_id FROM cards WHERE id = card_id));

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_funding_sources_updated_at BEFORE UPDATE ON funding_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();