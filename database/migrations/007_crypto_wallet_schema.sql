-- Migration 007: Crypto Wallet Schema
-- Adds cryptocurrency wallet integration tables with privacy isolation

-- Create crypto_wallets table for wallet management
CREATE TABLE crypto_wallets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    wallet_id VARCHAR(64) UNIQUE NOT NULL, -- Public wallet identifier
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_context_hash VARCHAR(255) NOT NULL, -- Cryptographic isolation key
    
    -- Wallet type and identification
    wallet_type VARCHAR(20) NOT NULL CHECK (wallet_type IN ('metamask', 'walletconnect', 'hardware', 'bitcoin')),
    wallet_address_encrypted TEXT NOT NULL, -- AES-256 encrypted wallet address
    wallet_address_hash VARCHAR(255) UNIQUE NOT NULL, -- SHA-256 hash for lookups without exposing address
    wallet_name VARCHAR(255), -- User-defined label
    
    -- Connection and session management
    connection_status VARCHAR(20) DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected', 'expired')),
    permissions TEXT[] DEFAULT '{}', -- Array of granted permissions
    session_expiry TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Supported currencies and metadata
    supported_currencies TEXT[] DEFAULT '{}', -- Array of supported currency codes
    last_balance_check TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Hardware wallet specific fields
    device_type VARCHAR(20), -- 'ledger' or 'trezor' for hardware wallets
    derivation_path VARCHAR(255), -- HD wallet derivation path
    address_index INTEGER, -- Address index for HD wallets
    
    -- WalletConnect specific fields
    bridge_url TEXT, -- WalletConnect bridge URL
    topic VARCHAR(255), -- WalletConnect session topic
    
    -- Bitcoin wallet specific fields
    address_type VARCHAR(20), -- 'legacy', 'segwit', 'native_segwit'
    public_key TEXT, -- Public key for Bitcoin wallets
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for performance
    CONSTRAINT wallet_user_type_unique UNIQUE (user_id, wallet_address_hash)
);

-- Create wallet_sessions table for session management
CREATE TABLE wallet_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL, -- Unique session identifier
    wallet_id VARCHAR(64) NOT NULL REFERENCES crypto_wallets(wallet_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_context_hash VARCHAR(255) NOT NULL, -- Cryptographic isolation key
    
    -- Session details
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    permissions TEXT[] DEFAULT '{}', -- Session-specific permissions
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Connection metadata
    connection_metadata JSONB DEFAULT '{}', -- Store connection-specific data
    user_agent TEXT, -- Client user agent
    ip_address INET, -- Client IP address (optional)
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create crypto_transactions table for cryptocurrency transaction tracking
CREATE TABLE crypto_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    transaction_id VARCHAR(64) UNIQUE NOT NULL, -- Unique transaction identifier
    wallet_id VARCHAR(64) NOT NULL REFERENCES crypto_wallets(wallet_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_context_hash VARCHAR(255) NOT NULL, -- Cryptographic isolation key
    
    -- Transaction details
    crypto_type VARCHAR(10) NOT NULL CHECK (crypto_type IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP')),
    crypto_amount DECIMAL(36, 18) NOT NULL CHECK (crypto_amount > 0), -- High precision for crypto amounts
    usd_amount INTEGER NOT NULL CHECK (usd_amount > 0), -- USD equivalent in cents
    conversion_rate DECIMAL(36, 18) NOT NULL, -- Rate at time of transaction
    network_fee INTEGER DEFAULT 0, -- Network fee in cents
    
    -- Transaction status and blockchain details
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'expired')),
    blockchain_tx_hash VARCHAR(255), -- External blockchain transaction hash
    block_number BIGINT, -- Block number where transaction was mined
    confirmations INTEGER DEFAULT 0, -- Number of confirmations
    
    -- Funding context (links to card without direct FK for privacy)
    funding_context VARCHAR(255), -- Cryptographic reference to funded card
    funding_type VARCHAR(20) CHECK (funding_type IN ('direct', 'allocation', 'withdrawal')),
    
    -- Error handling
    error_message TEXT,
    error_code VARCHAR(50),
    retry_count INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create crypto_rates table for conversion rate caching
CREATE TABLE crypto_rates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    currency_code VARCHAR(10) NOT NULL, -- BTC, ETH, USDT, etc.
    usd_rate DECIMAL(36, 18) NOT NULL, -- Current USD rate
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'coingecko', -- Rate source
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Ensure we only have one rate per currency
    CONSTRAINT crypto_rates_currency_unique UNIQUE (currency_code),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance optimization

-- Crypto wallets indexes
CREATE INDEX idx_crypto_wallets_user_id ON crypto_wallets(user_id);
CREATE INDEX idx_crypto_wallets_wallet_type ON crypto_wallets(wallet_type);
CREATE INDEX idx_crypto_wallets_connection_status ON crypto_wallets(connection_status);
CREATE INDEX idx_crypto_wallets_session_expiry ON crypto_wallets(session_expiry);
CREATE INDEX idx_crypto_wallets_last_balance_check ON crypto_wallets(last_balance_check);
CREATE INDEX idx_crypto_wallets_context_hash ON crypto_wallets(wallet_context_hash);

-- Wallet sessions indexes
CREATE INDEX idx_wallet_sessions_wallet_id ON wallet_sessions(wallet_id);
CREATE INDEX idx_wallet_sessions_user_id ON wallet_sessions(user_id);
CREATE INDEX idx_wallet_sessions_is_active ON wallet_sessions(is_active);
CREATE INDEX idx_wallet_sessions_expires_at ON wallet_sessions(expires_at);
CREATE INDEX idx_wallet_sessions_last_activity ON wallet_sessions(last_activity);
CREATE INDEX idx_wallet_sessions_context_hash ON wallet_sessions(session_context_hash);

-- Crypto transactions indexes
CREATE INDEX idx_crypto_transactions_wallet_id ON crypto_transactions(wallet_id);
CREATE INDEX idx_crypto_transactions_user_id ON crypto_transactions(user_id);
CREATE INDEX idx_crypto_transactions_crypto_type ON crypto_transactions(crypto_type);
CREATE INDEX idx_crypto_transactions_status ON crypto_transactions(status);
CREATE INDEX idx_crypto_transactions_blockchain_tx_hash ON crypto_transactions(blockchain_tx_hash);
CREATE INDEX idx_crypto_transactions_funding_context ON crypto_transactions(funding_context);
CREATE INDEX idx_crypto_transactions_created_at ON crypto_transactions(created_at);
CREATE INDEX idx_crypto_transactions_context_hash ON crypto_transactions(transaction_context_hash);

-- Crypto rates indexes
CREATE INDEX idx_crypto_rates_last_updated ON crypto_rates(last_updated);
CREATE INDEX idx_crypto_rates_source ON crypto_rates(source);

-- Row-level security policies for privacy isolation

-- Enable RLS on all tables
ALTER TABLE crypto_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_rates ENABLE ROW LEVEL SECURITY;

-- Crypto wallets RLS policies
CREATE POLICY crypto_wallets_isolation_policy ON crypto_wallets
    FOR ALL USING (
        wallet_context_hash = current_setting('app.current_context_hash', true)
        OR current_setting('app.bypass_rls', true)::boolean = true
    );

-- Wallet sessions RLS policies
CREATE POLICY wallet_sessions_isolation_policy ON wallet_sessions
    FOR ALL USING (
        session_context_hash = current_setting('app.current_context_hash', true)
        OR current_setting('app.bypass_rls', true)::boolean = true
    );

-- Crypto transactions RLS policies
CREATE POLICY crypto_transactions_isolation_policy ON crypto_transactions
    FOR ALL USING (
        transaction_context_hash = current_setting('app.current_context_hash', true)
        OR current_setting('app.bypass_rls', true)::boolean = true
    );

-- Crypto rates RLS policies (allow read access to all authenticated users)
CREATE POLICY crypto_rates_read_policy ON crypto_rates
    FOR SELECT USING (true);

CREATE POLICY crypto_rates_insert_policy ON crypto_rates
    FOR INSERT WITH CHECK (
        current_setting('app.bypass_rls', true)::boolean = true
    );

CREATE POLICY crypto_rates_update_policy ON crypto_rates
    FOR UPDATE USING (
        current_setting('app.bypass_rls', true)::boolean = true
    );

CREATE POLICY crypto_rates_delete_policy ON crypto_rates
    FOR DELETE USING (
        current_setting('app.bypass_rls', true)::boolean = true
    );

-- Create functions for automatic timestamp updates

CREATE OR REPLACE FUNCTION update_crypto_wallet_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_wallet_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_crypto_transaction_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates

CREATE TRIGGER trigger_update_crypto_wallet_timestamp
    BEFORE UPDATE ON crypto_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_crypto_wallet_timestamp();

CREATE TRIGGER trigger_update_wallet_session_timestamp
    BEFORE UPDATE ON wallet_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_session_timestamp();

CREATE TRIGGER trigger_update_crypto_transaction_timestamp
    BEFORE UPDATE ON crypto_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_crypto_transaction_timestamp();

-- Create function for automatic session cleanup

CREATE OR REPLACE FUNCTION cleanup_expired_wallet_sessions()
RETURNS void AS $$
BEGIN
    -- Deactivate expired sessions
    UPDATE wallet_sessions 
    SET is_active = false, updated_at = NOW()
    WHERE expires_at < NOW() AND is_active = true;
    
    -- Update corresponding wallet status
    UPDATE crypto_wallets 
    SET connection_status = 'expired', updated_at = NOW()
    WHERE wallet_id IN (
        SELECT DISTINCT wallet_id 
        FROM wallet_sessions 
        WHERE expires_at < NOW() AND is_active = false
    ) AND connection_status = 'connected';
END;
$$ LANGUAGE plpgsql;

-- Insert initial supported cryptocurrency rates (with placeholder values)
INSERT INTO crypto_rates (currency_code, usd_rate, source, metadata) VALUES
('BTC', 50000.00, 'coingecko', '{"symbol": "bitcoin", "name": "Bitcoin"}'),
('ETH', 3000.00, 'coingecko', '{"symbol": "ethereum", "name": "Ethereum"}'),
('USDT', 1.00, 'coingecko', '{"symbol": "tether", "name": "Tether"}'),
('USDC', 1.00, 'coingecko', '{"symbol": "usd-coin", "name": "USD Coin"}'),
('XRP', 0.50, 'coingecko', '{"symbol": "ripple", "name": "XRP"}')
ON CONFLICT (currency_code) DO NOTHING;

-- Create a function to validate wallet addresses (can be extended)
CREATE OR REPLACE FUNCTION validate_wallet_address(wallet_type TEXT, address TEXT)
RETURNS boolean AS $$
BEGIN
    CASE wallet_type
        WHEN 'metamask', 'walletconnect', 'hardware' THEN
            -- Ethereum address validation (0x followed by 40 hex characters)
            RETURN address ~ '^0x[a-fA-F0-9]{40}$';
        WHEN 'bitcoin' THEN
            -- Bitcoin address validation (basic patterns)
            RETURN address ~ '^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$' 
                OR address ~ '^3[a-km-zA-HJ-NP-Z1-9]{25,34}$'
                OR address ~ '^bc1[a-z0-9]{39,59}$';
        ELSE
            RETURN false;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Add constraint to validate wallet addresses
ALTER TABLE crypto_wallets 
ADD CONSTRAINT crypto_wallets_address_validation 
CHECK (validate_wallet_address(wallet_type, wallet_address_hash));

COMMENT ON TABLE crypto_wallets IS 'Stores cryptocurrency wallet connections with privacy isolation';
COMMENT ON TABLE wallet_sessions IS 'Manages active wallet connection sessions';
COMMENT ON TABLE crypto_transactions IS 'Tracks cryptocurrency funding transactions';
COMMENT ON TABLE crypto_rates IS 'Caches current cryptocurrency conversion rates';

COMMENT ON COLUMN crypto_wallets.wallet_address_encrypted IS 'AES-256 encrypted wallet address for secure storage';
COMMENT ON COLUMN crypto_wallets.wallet_address_hash IS 'SHA-256 hash of wallet address for lookups without exposing the address';
COMMENT ON COLUMN crypto_wallets.wallet_context_hash IS 'Cryptographic isolation key for row-level security';
COMMENT ON COLUMN crypto_transactions.crypto_amount IS 'High precision decimal for accurate crypto amounts';
COMMENT ON COLUMN crypto_transactions.funding_context IS 'Cryptographic reference to funded card maintaining privacy isolation';

-- Migration completed successfully
SELECT 'Migration 007: Crypto Wallet Schema completed successfully' as result;