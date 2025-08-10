-- Migration 015: Transaction Isolation & Privacy Protection Enhancement
-- This migration builds upon the privacy foundations established in migrations 013-014
-- implementing comprehensive transaction isolation to prevent correlation across cards

-- Enhanced isolation columns for cards table
ALTER TABLE cards 
ADD COLUMN IF NOT EXISTS isolation_context_hash TEXT NOT NULL DEFAULT gen_random_uuid()::text,
ADD COLUMN IF NOT EXISTS correlation_resistance_hash TEXT,
ADD COLUMN IF NOT EXISTS last_context_verification TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for isolation context lookups
CREATE INDEX IF NOT EXISTS idx_cards_isolation_context ON cards(isolation_context_hash);

-- Transaction isolation verification table
CREATE TABLE IF NOT EXISTS transaction_isolation_metrics (
    isolation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context_hash TEXT NOT NULL,
    isolation_verified BOOLEAN NOT NULL DEFAULT false,
    correlation_attempts INTEGER DEFAULT 0,
    last_verification_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    privacy_violation_detected BOOLEAN DEFAULT false,
    verification_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient isolation verification lookups
CREATE INDEX IF NOT EXISTS idx_isolation_metrics_card_context ON transaction_isolation_metrics(card_context_hash);
CREATE INDEX IF NOT EXISTS idx_isolation_metrics_violations ON transaction_isolation_metrics(privacy_violation_detected) WHERE privacy_violation_detected = true;

-- Enhanced audit table for isolation monitoring
ALTER TABLE compliance_audit 
ADD COLUMN IF NOT EXISTS isolation_event_data JSONB,
ADD COLUMN IF NOT EXISTS correlation_detection_result BOOLEAN;

-- Access pattern tracking for correlation detection
CREATE TABLE IF NOT EXISTS access_pattern_tracking (
    tracking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_hash TEXT NOT NULL,
    access_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    access_type TEXT NOT NULL CHECK (access_type IN ('read', 'write', 'context_switch', 'query')),
    query_signature TEXT, -- Anonymized query pattern without sensitive data
    ip_hash TEXT, -- Hashed IP for pattern detection without storing actual IP
    session_hash TEXT, -- Hashed session ID for temporal correlation detection
    potential_correlation BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient pattern analysis
CREATE INDEX IF NOT EXISTS idx_access_pattern_context ON access_pattern_tracking(context_hash);
CREATE INDEX IF NOT EXISTS idx_access_pattern_timestamp ON access_pattern_tracking(access_timestamp);
CREATE INDEX IF NOT EXISTS idx_access_pattern_correlation ON access_pattern_tracking(potential_correlation) WHERE potential_correlation = true;

-- Privacy-preserving analytics configuration
CREATE TABLE IF NOT EXISTS privacy_analytics_config (
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type TEXT NOT NULL,
    epsilon_budget DECIMAL(10,6) NOT NULL DEFAULT 1.0, -- Differential privacy parameter
    delta_threshold DECIMAL(10,9) DEFAULT 0.000001, -- Privacy failure probability
    k_anonymity_threshold INTEGER NOT NULL DEFAULT 5, -- Minimum group size
    noise_calibration JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Internal access control table
CREATE TABLE IF NOT EXISTS internal_access_control (
    access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL, -- Hashed employee ID
    role_name TEXT NOT NULL,
    card_context_hash TEXT,
    access_justification TEXT,
    access_granted BOOLEAN NOT NULL,
    accessed_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    suspicious_activity_detected BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for access control monitoring
CREATE INDEX IF NOT EXISTS idx_internal_access_employee ON internal_access_control(employee_id);
CREATE INDEX IF NOT EXISTS idx_internal_access_suspicious ON internal_access_control(suspicious_activity_detected) WHERE suspicious_activity_detected = true;

-- Third-party integration privacy limits
CREATE TABLE IF NOT EXISTS third_party_privacy_limits (
    limit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT NOT NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('payment_processor', 'fraud_detection', 'analytics', 'compliance')),
    max_requests_per_minute INTEGER NOT NULL,
    data_sharing_restrictions JSONB NOT NULL DEFAULT '{}',
    anonymization_required BOOLEAN DEFAULT true,
    certification_status TEXT,
    certification_expiry DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced RLS policies preventing correlation
-- Drop existing policies to recreate with enhanced isolation
DROP POLICY IF EXISTS card_isolation ON cards;
DROP POLICY IF EXISTS payment_isolation ON payment_transactions;

-- Enhanced card isolation policy with correlation resistance
CREATE POLICY enhanced_card_isolation ON cards
    FOR ALL
    USING (
        card_context_hash = current_setting('app.card_context', true) AND
        isolation_context_hash = current_setting('app.isolation_context', true)
    );

-- Cross-table correlation prevention for payment transactions
CREATE POLICY prevent_cross_table_correlation ON payment_transactions
    FOR ALL
    USING (
        card_context_hash = current_setting('app.card_context', true) AND
        NOT EXISTS (
            SELECT 1 FROM cards c 
            WHERE c.card_context_hash != payment_transactions.card_context_hash
            AND c.card_context_hash IS NOT NULL
        )
    );

-- Isolation policy for crypto transactions
CREATE POLICY crypto_transaction_isolation ON crypto_transactions
    FOR ALL
    USING (
        context_hash = current_setting('app.card_context', true)
    );

-- Isolation policy for transaction isolation metrics
CREATE POLICY isolation_metrics_policy ON transaction_isolation_metrics
    FOR ALL
    USING (
        card_context_hash = current_setting('app.card_context', true)
    );

-- Prevent cross-card joins in transaction history
CREATE POLICY transaction_history_isolation ON transaction_history
    FOR ALL
    USING (
        card_context_hash = current_setting('app.card_context', true) AND
        NOT EXISTS (
            SELECT 1 FROM transaction_history th2
            WHERE th2.card_context_hash != transaction_history.card_context_hash
            AND th2.user_id = transaction_history.user_id
        )
    );

-- Function to set isolation context
CREATE OR REPLACE FUNCTION set_isolation_context(context_value TEXT)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.isolation_context', context_value, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify isolation boundaries
CREATE OR REPLACE FUNCTION verify_isolation_boundaries(
    p_card_context_hash TEXT,
    p_isolation_context_hash TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_isolation_valid BOOLEAN;
    v_correlation_detected BOOLEAN;
BEGIN
    -- Check if contexts match current session
    IF current_setting('app.card_context', true) != p_card_context_hash OR
       current_setting('app.isolation_context', true) != p_isolation_context_hash THEN
        RETURN false;
    END IF;

    -- Check for correlation attempts in recent access patterns
    SELECT EXISTS (
        SELECT 1 FROM access_pattern_tracking
        WHERE context_hash = p_card_context_hash
        AND potential_correlation = true
        AND access_timestamp > NOW() - INTERVAL '15 minutes'
    ) INTO v_correlation_detected;

    -- Update isolation metrics
    INSERT INTO transaction_isolation_metrics (
        card_context_hash,
        isolation_verified,
        privacy_violation_detected
    ) VALUES (
        p_card_context_hash,
        NOT v_correlation_detected,
        v_correlation_detected
    ) ON CONFLICT (card_context_hash) DO UPDATE SET
        isolation_verified = NOT v_correlation_detected,
        privacy_violation_detected = v_correlation_detected,
        last_verification_time = NOW();

    RETURN NOT v_correlation_detected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to detect correlation patterns
CREATE OR REPLACE FUNCTION detect_correlation_patterns()
RETURNS TABLE (
    pattern_type TEXT,
    risk_level TEXT,
    contexts_involved TEXT[],
    detection_timestamp TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- Temporal correlation detection
    RETURN QUERY
    SELECT 
        'temporal_correlation' as pattern_type,
        CASE 
            WHEN COUNT(DISTINCT context_hash) > 3 THEN 'high'
            WHEN COUNT(DISTINCT context_hash) > 1 THEN 'medium'
            ELSE 'low'
        END as risk_level,
        ARRAY_AGG(DISTINCT context_hash) as contexts_involved,
        NOW() as detection_timestamp
    FROM access_pattern_tracking
    WHERE access_timestamp > NOW() - INTERVAL '5 minutes'
    GROUP BY session_hash
    HAVING COUNT(DISTINCT context_hash) > 1;

    -- IP-based correlation detection
    RETURN QUERY
    SELECT 
        'ip_correlation' as pattern_type,
        CASE 
            WHEN COUNT(DISTINCT context_hash) > 5 THEN 'high'
            WHEN COUNT(DISTINCT context_hash) > 2 THEN 'medium'
            ELSE 'low'
        END as risk_level,
        ARRAY_AGG(DISTINCT context_hash) as contexts_involved,
        NOW() as detection_timestamp
    FROM access_pattern_tracking
    WHERE access_timestamp > NOW() - INTERVAL '15 minutes'
    GROUP BY ip_hash
    HAVING COUNT(DISTINCT context_hash) > 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for privacy-preserving aggregation with differential privacy
CREATE OR REPLACE FUNCTION private_aggregate_sum(
    p_table_name TEXT,
    p_column_name TEXT,
    p_epsilon DECIMAL,
    p_sensitivity DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
    v_true_sum DECIMAL;
    v_noise DECIMAL;
    v_private_sum DECIMAL;
BEGIN
    -- Get true sum (would be filtered by RLS)
    EXECUTE format('SELECT COALESCE(SUM(%I), 0) FROM %I', p_column_name, p_table_name) INTO v_true_sum;
    
    -- Generate Laplace noise for differential privacy
    -- Using Box-Muller transform for Laplace distribution
    v_noise := p_sensitivity / p_epsilon * sign(random() - 0.5) * ln(1 - 2 * abs(random() - 0.5));
    
    -- Add noise to true value
    v_private_sum := v_true_sum + v_noise;
    
    -- Log privacy budget consumption
    INSERT INTO privacy_analytics_config (metric_type, epsilon_budget)
    VALUES ('aggregate_sum', p_epsilon);
    
    RETURN v_private_sum;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
CREATE TRIGGER update_transaction_isolation_metrics_updated_at
    BEFORE UPDATE ON transaction_isolation_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_privacy_analytics_config_updated_at
    BEFORE UPDATE ON privacy_analytics_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_third_party_privacy_limits_updated_at
    BEFORE UPDATE ON third_party_privacy_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default privacy configuration
INSERT INTO privacy_analytics_config (metric_type, epsilon_budget, k_anonymity_threshold)
VALUES 
    ('transaction_count', 1.0, 5),
    ('aggregate_spend', 0.5, 10),
    ('merchant_categories', 2.0, 5)
ON CONFLICT DO NOTHING;

-- Insert default third-party limits
INSERT INTO third_party_privacy_limits (service_name, service_type, max_requests_per_minute, data_sharing_restrictions)
VALUES 
    ('Marqeta', 'payment_processor', 100, '{"allowed_fields": ["transaction_id", "amount", "status"], "excluded_fields": ["user_id", "ip_address"]}'),
    ('Fraud Detection Service', 'fraud_detection', 50, '{"allowed_fields": ["transaction_pattern", "risk_score"], "excluded_fields": ["card_correlation", "user_profile"]}'),
    ('Analytics Partner', 'analytics', 10, '{"allowed_fields": ["aggregate_metrics"], "excluded_fields": ["individual_transactions", "user_data"]}')
ON CONFLICT DO NOTHING;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION set_isolation_context(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_isolation_boundaries(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_correlation_patterns() TO service_role;
GRANT EXECUTE ON FUNCTION private_aggregate_sum(TEXT, TEXT, DECIMAL, DECIMAL) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE transaction_isolation_metrics IS 'Tracks isolation verification status and privacy violations for each card context';
COMMENT ON TABLE access_pattern_tracking IS 'Monitors access patterns to detect potential correlation attempts across cards';
COMMENT ON TABLE privacy_analytics_config IS 'Configuration for privacy-preserving analytics with differential privacy parameters';
COMMENT ON TABLE internal_access_control IS 'Tracks and controls internal employee access to card data with justification requirements';
COMMENT ON TABLE third_party_privacy_limits IS 'Defines and enforces privacy limits for third-party service integrations';