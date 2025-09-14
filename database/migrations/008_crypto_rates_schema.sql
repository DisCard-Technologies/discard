-- Migration 008: Real-Time Cryptocurrency Conversion System
-- Story 2.2: Database schema for crypto rates, historical data, and conversion quotes

-- Create crypto_rates table for storing real-time rate data
DROP TABLE IF EXISTS crypto_rates CASCADE;
CREATE TABLE crypto_rates (
    rate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(10) NOT NULL, -- BTC, ETH, USDT, USDC, XRP
    usd_price DECIMAL(20, 8) NOT NULL, -- High precision for crypto prices
    change_24h DECIMAL(8, 4) DEFAULT 0, -- Percentage change
    volume_24h DECIMAL(30, 8) DEFAULT 0, -- 24h volume
    source VARCHAR(20) NOT NULL CHECK (source IN ('chainlink', 'coingecko', '0x', 'backup')),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create rate_history table for historical price tracking (7-day retention)
CREATE TABLE rate_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(10) NOT NULL,
    usd_price DECIMAL(20, 8) NOT NULL,
    volume DECIMAL(30, 8) DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    source VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create conversion_quotes table for slippage protection quotes
CREATE TABLE conversion_quotes (
    quote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_crypto VARCHAR(10) NOT NULL,
    to_crypto VARCHAR(10) NOT NULL DEFAULT 'USD',
    from_amount DECIMAL(30, 18) NOT NULL, -- High precision for crypto amounts
    to_amount DECIMAL(20, 8) NOT NULL, -- USD amount with precision
    rate DECIMAL(20, 8) NOT NULL, -- Conversion rate at quote time
    slippage_limit DECIMAL(5, 4) NOT NULL DEFAULT 0.02, -- Maximum acceptable slippage (2%)
    network_fee INTEGER NOT NULL DEFAULT 0, -- Network fee in cents
    conversion_fee INTEGER NOT NULL DEFAULT 0, -- Conversion fee in cents
    platform_fee INTEGER NOT NULL DEFAULT 0, -- Platform fee in cents
    total_fee INTEGER NOT NULL DEFAULT 0, -- Total fees in cents
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'used')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for optimal rate query performance

-- Primary lookup indexes for crypto_rates
CREATE INDEX idx_crypto_rates_symbol_active ON crypto_rates(symbol, is_active);
CREATE INDEX idx_crypto_rates_timestamp ON crypto_rates(timestamp DESC);
CREATE INDEX idx_crypto_rates_source ON crypto_rates(source);
CREATE INDEX idx_crypto_rates_symbol_timestamp ON crypto_rates(symbol, timestamp DESC);

-- Historical data indexes for rate_history
CREATE INDEX idx_rate_history_symbol ON rate_history(symbol);
CREATE INDEX idx_rate_history_timestamp ON rate_history(timestamp DESC);
CREATE INDEX idx_rate_history_symbol_timestamp ON rate_history(symbol, timestamp DESC);
CREATE INDEX idx_rate_history_created_at ON rate_history(created_at);

-- Quote management indexes for conversion_quotes
CREATE INDEX idx_conversion_quotes_status ON conversion_quotes(status);
CREATE INDEX idx_conversion_quotes_expires_at ON conversion_quotes(expires_at);
CREATE INDEX idx_conversion_quotes_from_crypto ON conversion_quotes(from_crypto);
CREATE INDEX idx_conversion_quotes_created_at ON conversion_quotes(created_at);

-- Implement data retention policies for rate history cleanup
-- Trigger function to automatically delete old rate history (7-day retention)
-- Added SECURITY DEFINER to ensure proper permissions for automated cleanup
CREATE OR REPLACE FUNCTION cleanup_rate_history()
RETURNS void AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM rate_history 
    WHERE created_at < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup activity for audit purposes
    INSERT INTO system_logs (operation, details, timestamp) 
    VALUES (
        'rate_history_cleanup', 
        format('Deleted %s expired rate history records', deleted_count), 
        NOW()
    ) ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'Cleaned up % expired rate history records', deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to automatically expire old conversion quotes
CREATE OR REPLACE FUNCTION expire_old_quotes()
RETURNS void AS $$
BEGIN
    UPDATE conversion_quotes 
    SET status = 'expired', updated_at = NOW()
    WHERE expires_at < NOW() AND status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Function to get latest rate for a symbol
CREATE OR REPLACE FUNCTION get_latest_rate(p_symbol VARCHAR)
RETURNS TABLE(
    rate_id UUID,
    symbol VARCHAR,
    usd_price DECIMAL,
    change_24h DECIMAL,
    volume_24h DECIMAL,
    source VARCHAR,
    "timestamp" TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cr.rate_id,
        cr.symbol,
        cr.usd_price,
        cr.change_24h,
        cr.volume_24h,
        cr.source,
        cr.timestamp
    FROM crypto_rates cr
    WHERE cr.symbol = p_symbol 
      AND cr.is_active = true
    ORDER BY cr.timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get rate comparison for multiple symbols
CREATE OR REPLACE FUNCTION get_rate_comparison(p_symbols VARCHAR[])
RETURNS TABLE(
    symbol VARCHAR,
    usd_price DECIMAL,
    change_24h DECIMAL,
    source VARCHAR,
    "timestamp" TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    WITH latest_rates AS (
        SELECT 
            cr.symbol,
            cr.usd_price,
            cr.change_24h,
            cr.source,
            cr.timestamp,
            ROW_NUMBER() OVER (PARTITION BY cr.symbol ORDER BY cr.timestamp DESC) as rn
        FROM crypto_rates cr
        WHERE cr.symbol = ANY(p_symbols) 
          AND cr.is_active = true
    )
    SELECT 
        lr.symbol,
        lr.usd_price,
        lr.change_24h,
        lr.source,
        lr.timestamp
    FROM latest_rates lr
    WHERE lr.rn = 1
    ORDER BY lr.symbol;
END;
$$ LANGUAGE plpgsql;

-- Add row-level security policies for privacy isolation
ALTER TABLE crypto_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_quotes ENABLE ROW LEVEL SECURITY;

-- Rate data is public (no user correlation as per security requirements)
CREATE POLICY crypto_rates_public_read ON crypto_rates
    FOR SELECT USING (true);

CREATE POLICY crypto_rates_service_write ON crypto_rates
    FOR ALL USING (current_user = 'service_user' OR current_user = 'api_service');

-- Historical data is also public but with retention limits
CREATE POLICY rate_history_public_read ON rate_history
    FOR SELECT USING (created_at > NOW() - INTERVAL '7 days');

CREATE POLICY rate_history_service_write ON rate_history
    FOR ALL USING (current_user = 'service_user' OR current_user = 'api_service');

-- Conversion quotes have no user correlation (privacy by default)
CREATE POLICY conversion_quotes_public_read ON conversion_quotes
    FOR SELECT USING (expires_at > NOW());

CREATE POLICY conversion_quotes_service_write ON conversion_quotes
    FOR ALL USING (current_user = 'service_user' OR current_user = 'api_service');

-- Add comments for documentation
COMMENT ON TABLE crypto_rates IS 'Real-time cryptocurrency rates from multiple sources';
COMMENT ON TABLE rate_history IS 'Historical rate data with 7-day retention for privacy';
COMMENT ON TABLE conversion_quotes IS 'Slippage-protected conversion quotes with expiration';

COMMENT ON COLUMN crypto_rates.symbol IS 'Cryptocurrency symbol (BTC, ETH, USDT, USDC, XRP)';
COMMENT ON COLUMN crypto_rates.usd_price IS 'Current USD price with high precision';
COMMENT ON COLUMN crypto_rates.source IS 'Rate source: chainlink, coingecko, 0x, backup';
COMMENT ON COLUMN crypto_rates.is_active IS 'Whether this rate is currently active';

COMMENT ON COLUMN conversion_quotes.slippage_limit IS 'Maximum acceptable price movement (decimal, e.g., 0.02 for 2%)';
COMMENT ON COLUMN conversion_quotes.expires_at IS 'Quote expiration time (5 minutes for security)';
COMMENT ON COLUMN conversion_quotes.status IS 'Quote status: active, expired, used';