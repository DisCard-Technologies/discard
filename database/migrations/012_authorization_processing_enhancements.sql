-- Migration 012: Authorization Processing Enhancements
-- Extends authorization system with real-time processing, fraud detection,
-- multi-currency support, and comprehensive transaction tracking

-- Enhanced authorization transactions table for detailed processing records
CREATE TABLE authorization_transactions (
    authorization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context TEXT NOT NULL, -- Privacy isolation key
    marqeta_transaction_token TEXT NOT NULL, -- Marqeta transaction reference
    merchant_name TEXT NOT NULL, -- Merchant identification
    merchant_category_code TEXT NOT NULL, -- MCC code for restrictions
    authorization_amount DECIMAL(12,2) NOT NULL, -- Cents
    currency_code TEXT NOT NULL DEFAULT 'USD', -- ISO currency code
    exchange_rate DECIMAL(12,8), -- For multi-currency transactions
    converted_amount DECIMAL(12,2), -- USD equivalent amount
    authorization_code TEXT, -- Network authorization code
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'expired', 'reversed')),
    decline_reason TEXT, -- Standardized decline reason
    decline_code TEXT, -- Network decline code
    response_time_ms INTEGER NOT NULL, -- Authorization processing time
    risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100), -- Fraud detection score (0-100)
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Authorization expiry
    merchant_location_country TEXT, -- ISO country code
    merchant_location_city TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Extend authorization_holds table with new fields for enhanced processing
ALTER TABLE authorization_holds ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;
ALTER TABLE authorization_holds ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100);
ALTER TABLE authorization_holds ADD COLUMN IF NOT EXISTS authorization_id UUID REFERENCES authorization_transactions(authorization_id);
ALTER TABLE authorization_holds ADD COLUMN IF NOT EXISTS released_amount DECIMAL(12,2);
ALTER TABLE authorization_holds ADD COLUMN IF NOT EXISTS release_reason TEXT;

-- Update authorization_holds amount columns to support higher precision
ALTER TABLE authorization_holds ALTER COLUMN authorization_amount TYPE DECIMAL(12,2);
ALTER TABLE authorization_holds ALTER COLUMN hold_amount TYPE DECIMAL(12,2);

-- Fraud detection logs table with privacy isolation
CREATE TABLE fraud_detection_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context TEXT NOT NULL, -- Privacy isolation key
    authorization_id UUID NOT NULL REFERENCES authorization_transactions(authorization_id) ON DELETE CASCADE,
    risk_factors JSONB NOT NULL, -- JSON object with risk factor scores
    total_risk_score INTEGER NOT NULL CHECK (total_risk_score >= 0 AND total_risk_score <= 100),
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    action_taken TEXT NOT NULL CHECK (action_taken IN ('approve', 'decline', 'review', 'step_up_auth')),
    velocity_score INTEGER DEFAULT 0, -- Transaction frequency risk
    amount_score INTEGER DEFAULT 0, -- Transaction amount risk
    location_score INTEGER DEFAULT 0, -- Geographic anomaly risk
    time_score INTEGER DEFAULT 0, -- Time-based pattern risk
    merchant_score INTEGER DEFAULT 0, -- Merchant category risk
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    privacy_isolated BOOLEAN NOT NULL DEFAULT true -- Ensures no cross-card correlation
);

-- Multi-currency transaction processing table
CREATE TABLE currency_conversion_rates (
    rate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency TEXT NOT NULL, -- ISO currency code
    to_currency TEXT NOT NULL DEFAULT 'USD', -- ISO currency code
    exchange_rate DECIMAL(12,8) NOT NULL,
    rate_source TEXT NOT NULL DEFAULT 'exchangerate-api.com',
    markup_percentage DECIMAL(5,4) NOT NULL DEFAULT 1.0000, -- Exchange rate markup
    fee_percentage DECIMAL(5,4) NOT NULL DEFAULT 2.5000, -- Foreign transaction fee
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Decline reason codes for standardized merchant communication
CREATE TABLE decline_reason_codes (
    reason_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decline_code TEXT NOT NULL UNIQUE,
    reason_category TEXT NOT NULL CHECK (reason_category IN ('insufficient_funds', 'fraud', 'restrictions', 'technical', 'compliance')),
    user_friendly_message TEXT NOT NULL,
    merchant_message TEXT NOT NULL,
    resolution_suggestion TEXT,
    is_retryable BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Authorization metrics for performance monitoring
CREATE TABLE authorization_metrics (
    metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context TEXT NOT NULL, -- Privacy isolation key
    metric_type TEXT NOT NULL CHECK (metric_type IN ('response_time', 'success_rate', 'decline_rate', 'fraud_detection')),
    metric_value DECIMAL(10,4) NOT NULL,
    measurement_window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    measurement_window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 1,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX idx_authorization_transactions_card_context ON authorization_transactions(card_context);
CREATE INDEX idx_authorization_transactions_marqeta_token ON authorization_transactions(marqeta_transaction_token);
CREATE INDEX idx_authorization_transactions_status ON authorization_transactions(status);
CREATE INDEX idx_authorization_transactions_processed_at ON authorization_transactions(processed_at);
CREATE INDEX idx_authorization_transactions_expires_at ON authorization_transactions(expires_at);
CREATE INDEX idx_authorization_transactions_risk_score ON authorization_transactions(risk_score);

CREATE INDEX idx_fraud_detection_logs_card_context ON fraud_detection_logs(card_context);
CREATE INDEX idx_fraud_detection_logs_authorization_id ON fraud_detection_logs(authorization_id);
CREATE INDEX idx_fraud_detection_logs_risk_level ON fraud_detection_logs(risk_level);
CREATE INDEX idx_fraud_detection_logs_analyzed_at ON fraud_detection_logs(analyzed_at);
CREATE INDEX idx_fraud_detection_logs_total_risk_score ON fraud_detection_logs(total_risk_score);

CREATE INDEX idx_currency_conversion_rates_currencies ON currency_conversion_rates(from_currency, to_currency);
CREATE INDEX idx_currency_conversion_rates_valid ON currency_conversion_rates(valid_from, valid_until);
CREATE INDEX idx_currency_conversion_rates_active ON currency_conversion_rates(is_active);

CREATE INDEX idx_decline_reason_codes_code ON decline_reason_codes(decline_code);
CREATE INDEX idx_decline_reason_codes_category ON decline_reason_codes(reason_category);

CREATE INDEX idx_authorization_metrics_card_context ON authorization_metrics(card_context);
CREATE INDEX idx_authorization_metrics_type ON authorization_metrics(metric_type);
CREATE INDEX idx_authorization_metrics_recorded ON authorization_metrics(recorded_at);

-- Row Level Security (RLS) policies for privacy isolation
ALTER TABLE authorization_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_detection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_metrics ENABLE ROW LEVEL SECURITY;

-- Public tables (no privacy concerns)
ALTER TABLE currency_conversion_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE decline_reason_codes ENABLE ROW LEVEL SECURITY;

-- RLS policy for authorization_transactions
CREATE POLICY authorization_transactions_isolation ON authorization_transactions
    FOR ALL USING (card_context = current_setting('app.current_card_context', true));

-- RLS policy for fraud_detection_logs (strict privacy isolation)
CREATE POLICY fraud_detection_logs_isolation ON fraud_detection_logs
    FOR ALL USING (card_context = current_setting('app.current_card_context', true));

-- RLS policy for authorization_metrics
CREATE POLICY authorization_metrics_isolation ON authorization_metrics
    FOR ALL USING (card_context = current_setting('app.current_card_context', true));

-- Public read access for currency rates and decline codes
CREATE POLICY currency_conversion_rates_read_all ON currency_conversion_rates
    FOR SELECT USING (true);

CREATE POLICY decline_reason_codes_read_all ON decline_reason_codes
    FOR SELECT USING (true);

-- Insert default decline reason codes
INSERT INTO decline_reason_codes (decline_code, reason_category, user_friendly_message, merchant_message, resolution_suggestion, is_retryable) VALUES
('INSUFFICIENT_FUNDS', 'insufficient_funds', 'Insufficient funds available', 'Declined - Insufficient Funds', 'Add funds to your account and try again', true),
('FRAUD_SUSPECTED', 'fraud', 'Transaction flagged for security review', 'Declined - Security Review', 'Contact customer support to verify your identity', false),
('CARD_SUSPENDED', 'restrictions', 'Card is temporarily suspended', 'Declined - Card Suspended', 'Contact customer support to reactivate your card', false),
('CARD_EXPIRED', 'restrictions', 'Card has expired', 'Declined - Card Expired', 'Request a new card from your account settings', false),
('MERCHANT_BLOCKED', 'restrictions', 'Merchant is blocked by your settings', 'Declined - Merchant Restriction', 'Update your merchant restrictions in settings', true),
('GEOGRAPHIC_RESTRICTION', 'restrictions', 'Transaction location not allowed', 'Declined - Geographic Restriction', 'Update your location restrictions in settings', true),
('AMOUNT_LIMIT_EXCEEDED', 'restrictions', 'Transaction exceeds spending limit', 'Declined - Amount Limit', 'Increase your spending limit or use a smaller amount', true),
('PROCESSING_ERROR', 'technical', 'Unable to process transaction', 'Declined - Processing Error', 'Please try again in a few moments', true),
('NETWORK_ERROR', 'technical', 'Network communication error', 'Declined - Network Error', 'Check your connection and try again', true),
('INVALID_MERCHANT', 'compliance', 'Merchant not authorized', 'Declined - Invalid Merchant', 'Contact the merchant for assistance', false),
('CURRENCY_NOT_SUPPORTED', 'technical', 'Currency not supported', 'Declined - Currency Not Supported', 'Use a supported currency', false),
('RATE_LIMIT_EXCEEDED', 'technical', 'Too many requests', 'Declined - Rate Limit', 'Please wait and try again', true);

-- Function to clean up expired authorization data
CREATE OR REPLACE FUNCTION cleanup_expired_authorizations()
RETURNS void AS $$
BEGIN
    -- Update expired authorizations
    UPDATE authorization_transactions
    SET status = 'expired'
    WHERE status IN ('pending', 'approved')
    AND expires_at < NOW();
    
    -- Cleanup old fraud detection logs (older than 90 days)
    DELETE FROM fraud_detection_logs
    WHERE analyzed_at < NOW() - INTERVAL '90 days';
    
    -- Cleanup old currency rates (older than 7 days)
    DELETE FROM currency_conversion_rates
    WHERE cached_at < NOW() - INTERVAL '7 days'
    AND is_active = false;
    
    -- Cleanup old authorization metrics (older than 1 year)
    DELETE FROM authorization_metrics
    WHERE recorded_at < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- Function to calculate risk score based on transaction patterns
CREATE OR REPLACE FUNCTION calculate_risk_score(
    p_card_context TEXT,
    p_amount DECIMAL,
    p_merchant_category_code TEXT,
    p_merchant_country TEXT,
    p_transaction_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS INTEGER AS $$
DECLARE
    velocity_score INTEGER := 0;
    amount_score INTEGER := 0;
    location_score INTEGER := 0;
    time_score INTEGER := 0;
    merchant_score INTEGER := 0;
    total_score INTEGER := 0;
    avg_amount DECIMAL;
    hourly_count INTEGER;
    is_business_hours BOOLEAN;
BEGIN
    -- Velocity check: transactions in last hour
    SELECT COUNT(*)
    INTO hourly_count
    FROM authorization_transactions
    WHERE card_context = p_card_context
    AND processed_at > p_transaction_time - INTERVAL '1 hour'
    AND status IN ('approved', 'pending');
    
    -- Calculate velocity score (0-30 points)
    velocity_score := LEAST(30, hourly_count * 3);
    
    -- Amount anomaly check
    SELECT AVG(authorization_amount)
    INTO avg_amount
    FROM authorization_transactions
    WHERE card_context = p_card_context
    AND processed_at > p_transaction_time - INTERVAL '30 days'
    AND status = 'approved';
    
    -- Calculate amount score (0-25 points)
    IF avg_amount IS NOT NULL AND avg_amount > 0 THEN
        IF p_amount > avg_amount * 5 THEN
            amount_score := 25;
        ELSIF p_amount > avg_amount * 3 THEN
            amount_score := 15;
        ELSIF p_amount > avg_amount * 2 THEN
            amount_score := 10;
        END IF;
    END IF;
    
    -- Geographic risk score (0-20 points)
    -- High-risk countries get higher scores
    location_score := CASE 
        WHEN p_merchant_country IN ('US', 'CA', 'GB', 'DE', 'FR', 'AU', 'NZ') THEN 0
        WHEN p_merchant_country IN ('MX', 'BR', 'JP', 'KR', 'SG') THEN 5
        ELSE 15
    END;
    
    -- Time-based analysis (0-15 points)
    -- Extract hour from transaction time
    is_business_hours := EXTRACT(HOUR FROM p_transaction_time) BETWEEN 6 AND 23;
    time_score := CASE WHEN NOT is_business_hours THEN 10 ELSE 0 END;
    
    -- Merchant category risk (0-10 points)
    -- High-risk MCC codes
    merchant_score := CASE 
        WHEN p_merchant_category_code IN ('7995', '7801', '7802') THEN 10 -- Gambling
        WHEN p_merchant_category_code IN ('5962', '5993') THEN 8 -- Adult entertainment
        WHEN p_merchant_category_code IN ('6051', '7299') THEN 6 -- High-risk financial
        ELSE 0
    END;
    
    -- Calculate total risk score
    total_score := velocity_score + amount_score + location_score + time_score + merchant_score;
    
    -- Cap at 100
    RETURN LEAST(100, total_score);
END;
$$ LANGUAGE plpgsql;

-- Function to get risk level from score
CREATE OR REPLACE FUNCTION get_risk_level(risk_score INTEGER)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE
        WHEN risk_score >= 0 AND risk_score <= 30 THEN 'low'
        WHEN risk_score >= 31 AND risk_score <= 70 THEN 'medium'
        WHEN risk_score >= 71 AND risk_score <= 90 THEN 'high'
        WHEN risk_score >= 91 AND risk_score <= 100 THEN 'critical'
        ELSE 'unknown'
    END;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update authorization_holds.updated_at
CREATE TRIGGER update_authorization_holds_updated_at
    BEFORE UPDATE ON authorization_holds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE authorization_transactions IS 'Detailed records of all authorization processing attempts with timing and risk data';
COMMENT ON TABLE fraud_detection_logs IS 'Privacy-isolated fraud detection analysis logs with risk scoring breakdown';
COMMENT ON TABLE currency_conversion_rates IS 'Cached currency exchange rates with markup and fee information';
COMMENT ON TABLE decline_reason_codes IS 'Standardized decline reason codes for consistent merchant and user communication';
COMMENT ON TABLE authorization_metrics IS 'Performance metrics for authorization processing monitoring';

COMMENT ON COLUMN authorization_transactions.response_time_ms IS 'Total processing time from request to response in milliseconds';
COMMENT ON COLUMN authorization_transactions.risk_score IS 'Calculated fraud risk score from 0 (low risk) to 100 (high risk)';
COMMENT ON COLUMN fraud_detection_logs.privacy_isolated IS 'Flag ensuring no cross-card correlation in fraud analysis';
COMMENT ON COLUMN currency_conversion_rates.markup_percentage IS 'Exchange rate markup percentage applied to base rate';
COMMENT ON COLUMN decline_reason_codes.is_retryable IS 'Whether the transaction can be retried after addressing the decline reason';

-- Create indexes on the new authorization_holds columns
CREATE INDEX idx_authorization_holds_authorization_id ON authorization_holds(authorization_id);
CREATE INDEX idx_authorization_holds_response_time ON authorization_holds(response_time_ms);
CREATE INDEX idx_authorization_holds_risk_score ON authorization_holds(risk_score);