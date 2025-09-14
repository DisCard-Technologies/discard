-- Migration 017: Compliance & Regulatory Features Schema
-- This migration creates tables for AML monitoring, KYC records, and compliance audit trails
-- while maintaining privacy isolation and GDPR/CCPA compliance

-- RLS will be enabled on individual tables below

-- Compliance Events table for AML monitoring and suspicious activity tracking
CREATE TABLE IF NOT EXISTS compliance_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context_hash TEXT NOT NULL, -- Privacy-preserving card reference from existing isolation pattern
    event_type TEXT NOT NULL CHECK (event_type IN ('aml_threshold', 'kyc_required', 'suspicious_pattern', 'regulatory_report', 'velocity_anomaly', 'structuring_detected', 'high_risk_merchant', 'round_amount_pattern', 'rapid_movement')),
    risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    confidence_level DECIMAL(3,2) CHECK (confidence_level >= 0 AND confidence_level <= 1),
    pattern_type TEXT CHECK (pattern_type IN ('structuring', 'rapid_movement', 'unusual_velocity', 'high_risk_merchant', 'round_amount_pattern')),
    event_data JSONB, -- Encrypted compliance details and evidence data
    action_taken TEXT NOT NULL CHECK (action_taken IN ('none', 'alert', 'report', 'escalate', 'monitor', 'review', 'report_sar')),
    recommended_action TEXT CHECK (recommended_action IN ('none', 'monitor', 'review', 'report_sar')),
    threshold_value DECIMAL(15,2), -- The threshold that was exceeded
    actual_value DECIMAL(15,2), -- The actual value that triggered the alert
    retention_until TIMESTAMP WITH TIME ZONE NOT NULL, -- Automated deletion schedule
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- KYC Records table with minimal data collection
CREATE TABLE IF NOT EXISTS kyc_records (
    record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_context_hash TEXT NOT NULL, -- Privacy-preserving user reference (hashed user ID)
    kyc_level TEXT NOT NULL CHECK (kyc_level IN ('basic', 'enhanced', 'full')),
    verification_status TEXT NOT NULL CHECK (verification_status IN ('pending', 'verified', 'rejected', 'expired')),
    encrypted_data TEXT, -- Minimal required KYC data (encrypted)
    collection_reason TEXT NOT NULL, -- Why KYC was collected (regulatory requirement)
    consent_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    consent_version TEXT NOT NULL DEFAULT '1.0',
    data_sources JSONB, -- Record of where data was collected from
    verification_method TEXT, -- How the data was verified
    verifier_id UUID, -- Reference to compliance officer who verified
    retention_until TIMESTAMP WITH TIME ZONE NOT NULL, -- GDPR/CCPA compliant deletion date
    gdpr_lawful_basis TEXT CHECK (gdpr_lawful_basis IN ('legal_obligation', 'legitimate_interests', 'consent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft delete for audit trail
);

-- Suspicious Activity Reports (SARs) tracking
CREATE TABLE IF NOT EXISTS suspicious_activity_reports (
    sar_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_number TEXT UNIQUE NOT NULL, -- Sequential SAR number for regulatory filing
    card_context_hash TEXT NOT NULL,
    filing_status TEXT NOT NULL CHECK (filing_status IN ('draft', 'pending_review', 'filed', 'rejected')) DEFAULT 'draft',
    regulatory_agency TEXT NOT NULL DEFAULT 'FinCEN',
    total_suspicious_amount DECIMAL(15,2) NOT NULL,
    suspicious_activity_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    suspicious_activity_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    narrative_description TEXT NOT NULL, -- Human-readable description of suspicious activity
    supporting_evidence JSONB, -- References to compliance events that support this SAR
    compliance_officer_id UUID NOT NULL,
    reviewed_by UUID, -- Senior compliance officer review
    filed_at TIMESTAMP WITH TIME ZONE,
    regulatory_response JSONB, -- Any response from regulatory agencies
    retention_until TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Regulatory Reporting table for automated compliance reports
CREATE TABLE IF NOT EXISTS regulatory_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type TEXT NOT NULL CHECK (report_type IN ('monthly_aml', 'quarterly_compliance', 'annual_summary', 'ad_hoc_suspicious', 'currency_transaction_report')),
    reporting_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    reporting_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    report_data JSONB NOT NULL, -- Anonymized and aggregated compliance data
    privacy_preserving_method TEXT NOT NULL CHECK (privacy_preserving_method IN ('differential_privacy', 'k_anonymity', 'statistical_disclosure_control')),
    epsilon_budget_used DECIMAL(10,6), -- For differential privacy reports
    k_anonymity_level INTEGER, -- Minimum k-anonymity achieved
    regulatory_recipient TEXT NOT NULL,
    filing_deadline TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    submission_reference TEXT, -- Reference from regulatory system
    report_hash TEXT NOT NULL, -- Cryptographic hash for integrity verification
    generated_by_system BOOLEAN DEFAULT TRUE,
    compliance_officer_review UUID,
    retention_until TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Privacy Rights Requests table for GDPR/CCPA compliance
CREATE TABLE IF NOT EXISTS privacy_rights_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_context_hash TEXT NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('data_access', 'data_deletion', 'data_portability', 'consent_withdrawal', 'data_rectification')),
    request_status TEXT NOT NULL CHECK (request_status IN ('received', 'verified', 'processing', 'completed', 'rejected', 'expired')) DEFAULT 'received',
    legal_basis TEXT NOT NULL CHECK (legal_basis IN ('gdpr_article_15', 'gdpr_article_17', 'gdpr_article_20', 'ccpa_right_to_know', 'ccpa_right_to_delete')),
    identity_verification_status TEXT NOT NULL CHECK (identity_verification_status IN ('pending', 'verified', 'failed')) DEFAULT 'pending',
    identity_verification_method TEXT,
    request_details JSONB, -- Specific details about what data is requested
    response_data JSONB, -- Data provided in response (for access requests)
    processing_notes TEXT, -- Internal notes about processing the request
    compliance_officer_assigned UUID,
    legal_review_required BOOLEAN DEFAULT FALSE,
    legal_reviewer_id UUID,
    completion_deadline TIMESTAMP WITH TIME ZONE NOT NULL, -- 30 days for GDPR, varies for CCPA
    completed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    audit_trail JSONB, -- Log of all actions taken on this request
    retention_until TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data Retention Schedule table for automated compliance data lifecycle
CREATE TABLE IF NOT EXISTS data_retention_schedules (
    schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_category TEXT NOT NULL CHECK (data_category IN ('kyc_records', 'compliance_events', 'sar_reports', 'privacy_requests', 'audit_logs', 'transaction_data')),
    retention_period_days INTEGER NOT NULL,
    legal_basis_for_retention TEXT NOT NULL,
    automatic_deletion BOOLEAN DEFAULT TRUE,
    deletion_method TEXT NOT NULL CHECK (deletion_method IN ('soft_delete', 'hard_delete', 'cryptographic_deletion', 'anonymization')),
    approval_required_for_deletion BOOLEAN DEFAULT FALSE,
    regulatory_requirements JSONB, -- References to specific regulations requiring retention
    exceptions JSONB, -- Conditions where retention period may vary
    last_policy_review TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    next_policy_review TIMESTAMP WITH TIME ZONE,
    policy_version TEXT NOT NULL DEFAULT '1.0',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance Configuration table for adaptable regulatory rules
CREATE TABLE IF NOT EXISTS compliance_configuration (
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_category TEXT NOT NULL CHECK (config_category IN ('aml_thresholds', 'kyc_requirements', 'reporting_schedules', 'privacy_settings', 'retention_policies')),
    config_name TEXT NOT NULL,
    config_value JSONB NOT NULL,
    regulation_reference TEXT, -- Reference to specific regulation (e.g., "BSA Section 5318")
    jurisdiction TEXT NOT NULL DEFAULT 'US',
    effective_date TIMESTAMP WITH TIME ZONE NOT NULL,
    expiration_date TIMESTAMP WITH TIME ZONE,
    change_reason TEXT,
    changed_by UUID NOT NULL,
    approval_required BOOLEAN DEFAULT TRUE,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    version_number INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES compliance_configuration(config_id),
    audit_trail JSONB,
    active BOOLEAN DEFAULT FALSE, -- Requires approval to activate
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Trail table for compliance events (immutable logging)
CREATE TABLE IF NOT EXISTS compliance_audit (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_event_type TEXT NOT NULL,
    user_context_hash TEXT, -- Optional: user involved in the event
    card_context_hash TEXT, -- Optional: card involved in the event
    compliance_officer_id UUID, -- Optional: compliance officer who performed action
    event_category TEXT NOT NULL CHECK (event_category IN ('aml_detection', 'kyc_collection', 'sar_filing', 'privacy_request', 'data_deletion', 'configuration_change', 'report_generation')),
    event_description TEXT NOT NULL,
    isolation_event_data JSONB, -- From transaction isolation service
    before_data JSONB, -- State before the event
    after_data JSONB, -- State after the event
    risk_assessment JSONB, -- Associated risk scores and levels
    regulatory_impact TEXT, -- Description of regulatory implications
    event_hash TEXT NOT NULL, -- Cryptographic hash for tamper detection
    previous_hash TEXT, -- Hash of previous audit record (blockchain-style integrity)
    event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    retention_until TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Privacy Analytics Budget tracking for differential privacy
CREATE TABLE IF NOT EXISTS privacy_analytics_config (
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type TEXT NOT NULL,
    epsilon_budget DECIMAL(10,6) NOT NULL, -- Privacy budget allocated
    delta_parameter DECIMAL(15,12), -- Privacy failure probability
    query_sensitivity DECIMAL(10,2) NOT NULL,
    k_anonymity_threshold INTEGER DEFAULT 5,
    budget_period TEXT NOT NULL CHECK (budget_period IN ('hourly', 'daily', 'weekly', 'monthly')) DEFAULT 'daily',
    budget_reset_time TIMESTAMP WITH TIME ZONE NOT NULL,
    budget_consumed DECIMAL(10,6) DEFAULT 0,
    max_epsilon_per_query DECIMAL(10,6) NOT NULL,
    noise_calibration JSONB, -- Technical parameters for noise generation
    usage_log JSONB, -- Log of budget consumption
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance optimization

-- Compliance events indexes
CREATE INDEX IF NOT EXISTS idx_compliance_events_card_context ON compliance_events(card_context_hash);
CREATE INDEX IF NOT EXISTS idx_compliance_events_detected_at ON compliance_events(detected_at);
CREATE INDEX IF NOT EXISTS idx_compliance_events_risk_score ON compliance_events(risk_score) WHERE risk_score >= 50;
CREATE INDEX IF NOT EXISTS idx_compliance_events_pattern_type ON compliance_events(pattern_type) WHERE pattern_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_events_retention ON compliance_events(retention_until);

-- KYC records indexes
CREATE INDEX IF NOT EXISTS idx_kyc_records_user_context ON kyc_records(user_context_hash);
CREATE INDEX IF NOT EXISTS idx_kyc_records_status ON kyc_records(verification_status);
CREATE INDEX IF NOT EXISTS idx_kyc_records_retention ON kyc_records(retention_until);
CREATE INDEX IF NOT EXISTS idx_kyc_records_level ON kyc_records(kyc_level);

-- SAR reports indexes
CREATE INDEX IF NOT EXISTS idx_sar_reports_card_context ON suspicious_activity_reports(card_context_hash);
CREATE INDEX IF NOT EXISTS idx_sar_reports_filing_status ON suspicious_activity_reports(filing_status);
CREATE INDEX IF NOT EXISTS idx_sar_reports_filed_at ON suspicious_activity_reports(filed_at);

-- Privacy requests indexes
CREATE INDEX IF NOT EXISTS idx_privacy_requests_user_context ON privacy_rights_requests(user_context_hash);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON privacy_rights_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_deadline ON privacy_rights_requests(completion_deadline);

-- Audit trail indexes
CREATE INDEX IF NOT EXISTS idx_compliance_audit_timestamp ON compliance_audit(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_category ON compliance_audit(event_category);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_card_context ON compliance_audit(card_context_hash) WHERE card_context_hash IS NOT NULL;

-- Row Level Security Policies

-- Compliance events isolation policy
DROP POLICY IF EXISTS compliance_events_isolation ON compliance_events;
CREATE POLICY compliance_events_isolation ON compliance_events
    FOR ALL
    USING (card_context_hash = current_setting('app.card_context', true));

-- Enable RLS on compliance events
ALTER TABLE compliance_events ENABLE ROW LEVEL SECURITY;

-- KYC records access policy (restricted to compliance officers)
DROP POLICY IF EXISTS kyc_records_access ON kyc_records;
CREATE POLICY kyc_records_access ON kyc_records
    FOR ALL
    USING (
        current_setting('app.user_role', true) = 'compliance_officer' OR
        user_context_hash = current_setting('app.user_context', true)
    );

-- Enable RLS on KYC records
ALTER TABLE kyc_records ENABLE ROW LEVEL SECURITY;

-- SAR reports access policy (compliance officers only)
DROP POLICY IF EXISTS sar_reports_access ON suspicious_activity_reports;
CREATE POLICY sar_reports_access ON suspicious_activity_reports
    FOR ALL
    USING (current_setting('app.user_role', true) IN ('compliance_officer', 'senior_compliance_officer'));

-- Enable RLS on SAR reports
ALTER TABLE suspicious_activity_reports ENABLE ROW LEVEL SECURITY;

-- Privacy rights requests access policy
DROP POLICY IF EXISTS privacy_requests_access ON privacy_rights_requests;
CREATE POLICY privacy_requests_access ON privacy_rights_requests
    FOR ALL
    USING (
        current_setting('app.user_role', true) IN ('compliance_officer', 'privacy_officer') OR
        user_context_hash = current_setting('app.user_context', true)
    );

-- Enable RLS on privacy rights requests
ALTER TABLE privacy_rights_requests ENABLE ROW LEVEL SECURITY;

-- Audit trail read-only policy
DROP POLICY IF EXISTS compliance_audit_read_only ON compliance_audit;
CREATE POLICY compliance_audit_read_only ON compliance_audit
    FOR SELECT
    USING (current_setting('app.user_role', true) IN ('compliance_officer', 'audit_officer', 'senior_compliance_officer'));

-- Insert-only policy for audit trail (system can insert, humans can only read)
DROP POLICY IF EXISTS compliance_audit_insert_only ON compliance_audit;
CREATE POLICY compliance_audit_insert_only ON compliance_audit
    FOR INSERT
    WITH CHECK (current_setting('app.system_role', true) = 'compliance_system');

-- Enable RLS on audit trail
ALTER TABLE compliance_audit ENABLE ROW LEVEL SECURITY;

-- Functions for automated data retention and cleanup

-- Function to automatically delete expired compliance data
CREATE OR REPLACE FUNCTION cleanup_expired_compliance_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- Delete expired compliance events
    DELETE FROM compliance_events WHERE retention_until <= NOW();
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Delete expired KYC records (soft delete first, then hard delete after grace period)
    UPDATE kyc_records 
    SET deleted_at = NOW() 
    WHERE retention_until <= NOW() AND deleted_at IS NULL;
    
    -- Hard delete KYC records after 90-day grace period
    DELETE FROM kyc_records 
    WHERE deleted_at IS NOT NULL AND deleted_at <= NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Delete expired SAR reports (keep for 5 years minimum)
    DELETE FROM suspicious_activity_reports 
    WHERE retention_until <= NOW() AND created_at <= NOW() - INTERVAL '5 years';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Delete expired privacy rights requests
    DELETE FROM privacy_rights_requests WHERE retention_until <= NOW();
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Delete expired audit records (keep for regulatory minimum)
    DELETE FROM compliance_audit WHERE retention_until <= NOW();
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to verify isolation boundaries for compliance data
CREATE OR REPLACE FUNCTION verify_compliance_isolation_boundaries(
    p_card_context_hash TEXT,
    p_compliance_context_hash TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    cross_context_count INTEGER;
BEGIN
    -- Check if any compliance events reference data across contexts
    SELECT COUNT(*)
    INTO cross_context_count
    FROM compliance_events ce1
    JOIN compliance_events ce2 ON ce1.event_id != ce2.event_id
    WHERE ce1.card_context_hash = p_card_context_hash
    AND ce2.card_context_hash != p_card_context_hash
    AND ce1.event_data::text ILIKE '%' || ce2.card_context_hash || '%';
    
    -- Return false if any cross-context references found
    RETURN cross_context_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Function to generate privacy-preserving analytics with differential privacy
CREATE OR REPLACE FUNCTION generate_private_compliance_metrics(
    p_metric_type TEXT,
    p_epsilon DECIMAL(10,6),
    p_sensitivity DECIMAL(10,2),
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE
) RETURNS JSONB AS $$
DECLARE
    true_value DECIMAL(15,2);
    noise_value DECIMAL(15,2);
    private_result DECIMAL(15,2);
    result JSONB;
BEGIN
    -- Calculate true metric value (this would be expanded for different metric types)
    CASE p_metric_type
        WHEN 'suspicious_transaction_count' THEN
            SELECT COUNT(*)::DECIMAL INTO true_value
            FROM compliance_events
            WHERE detected_at BETWEEN p_start_date AND p_end_date
            AND event_type = 'suspicious_pattern';
        WHEN 'aml_alert_rate' THEN
            SELECT AVG(risk_score)::DECIMAL INTO true_value
            FROM compliance_events
            WHERE detected_at BETWEEN p_start_date AND p_end_date
            AND risk_score > 50;
        ELSE
            true_value := 0;
    END CASE;
    
    -- Generate Laplace noise: Lap(sensitivity/epsilon)
    -- This is a simplified noise generation - in production, use proper cryptographic randomness
    noise_value := (p_sensitivity / p_epsilon) * (random() - 0.5) * 2;
    
    -- Apply noise and ensure non-negative result
    private_result := GREATEST(0, true_value + noise_value);
    
    -- Return structured result
    result := jsonb_build_object(
        'metric_type', p_metric_type,
        'value', private_result,
        'epsilon_used', p_epsilon,
        'sensitivity', p_sensitivity,
        'noise_level', ABS(noise_value),
        'generated_at', NOW(),
        'period_start', p_start_date,
        'period_end', p_end_date
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Insert default data retention schedules
INSERT INTO data_retention_schedules (data_category, retention_period_days, legal_basis_for_retention, deletion_method, regulatory_requirements) VALUES
('compliance_events', 2555, 'BSA recordkeeping requirements', 'hard_delete', '{"regulation": "BSA", "section": "31 CFR 1020.410", "requirement": "5 years from transaction date"}'),
('kyc_records', 1825, 'Customer identification program requirements', 'cryptographic_deletion', '{"regulation": "BSA", "section": "31 CFR 1020.220", "requirement": "5 years after account closure"}'),
('sar_reports', 1825, 'SAR retention requirements', 'hard_delete', '{"regulation": "BSA", "section": "31 CFR 1020.320", "requirement": "5 years from filing date"}'),
('privacy_requests', 1095, 'GDPR compliance and audit trail', 'hard_delete', '{"regulation": "GDPR", "article": "Article 17", "requirement": "3 years for audit purposes"}'),
('audit_logs', 2555, 'Regulatory examination requirements', 'hard_delete', '{"regulation": "Multiple", "requirement": "7 years for regulatory examination"}')
ON CONFLICT DO NOTHING;

-- Insert default compliance configuration
INSERT INTO compliance_configuration (config_category, config_name, config_value, regulation_reference, effective_date, changed_by, approved_by, approved_at, active) VALUES
('aml_thresholds', 'structuring_detection', '{"single_threshold": 9000, "daily_aggregate": 10000, "pattern_window_hours": 24, "min_transactions": 3}', 'BSA Section 5318', NOW(), gen_random_uuid(), gen_random_uuid(), NOW(), true),
('aml_thresholds', 'velocity_monitoring', '{"hourly_limit": 10, "daily_limit": 50, "amount_per_hour": 25000}', 'BSA Section 5318', NOW(), gen_random_uuid(), gen_random_uuid(), NOW(), true),
('kyc_requirements', 'risk_based_kyc', '{"basic": {"transaction_limit": 1000, "monthly_limit": 5000}, "enhanced": {"transaction_limit": 10000, "monthly_limit": 50000}, "full": {"no_limits": true}}', 'BSA Section 5318', NOW(), gen_random_uuid(), gen_random_uuid(), NOW(), true),
('privacy_settings', 'differential_privacy', '{"default_epsilon": 1.0, "daily_budget": 10.0, "max_epsilon_per_query": 2.0, "k_anonymity_min": 5}', 'GDPR Article 25', NOW(), gen_random_uuid(), gen_random_uuid(), NOW(), true)
ON CONFLICT DO NOTHING;

-- Insert default privacy analytics configuration
INSERT INTO privacy_analytics_config (metric_type, epsilon_budget, query_sensitivity, k_anonymity_threshold, budget_reset_time, max_epsilon_per_query, noise_calibration) VALUES
('compliance_rate', 1.0, 1.0, 5, NOW() + INTERVAL '1 day', 0.5, '{"mechanism": "laplace", "sensitivity_analysis": "completed"}'),
('suspicious_activity_count', 0.5, 1.0, 10, NOW() + INTERVAL '1 day', 0.25, '{"mechanism": "laplace", "sensitivity_analysis": "completed"}'),
('aml_alert_rate', 1.5, 100.0, 5, NOW() + INTERVAL '1 day', 0.75, '{"mechanism": "laplace", "sensitivity_analysis": "completed"}')
ON CONFLICT DO NOTHING;