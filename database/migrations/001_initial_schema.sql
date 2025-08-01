-- Migration: 001 - Initial Schema
-- Created: 2025-01-27
-- Description: Create initial database schema for DisCard application

BEGIN;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
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
CREATE TABLE IF NOT EXISTS cards (
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
CREATE TABLE IF NOT EXISTS transactions (
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
CREATE TABLE IF NOT EXISTS funding_sources (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('crypto_wallet', 'bank_account', 'crypto_exchange')),
    source_identifier VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Card funding table
CREATE TABLE IF NOT EXISTS card_funding (
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_card_id ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_funding_sources_user_id ON funding_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_card_funding_card_id ON card_funding(card_id);
CREATE INDEX IF NOT EXISTS idx_card_funding_status ON card_funding(status);

-- Create update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cards_updated_at ON cards;
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_funding_sources_updated_at ON funding_sources;
CREATE TRIGGER update_funding_sources_updated_at BEFORE UPDATE ON funding_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;