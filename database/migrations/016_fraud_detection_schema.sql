-- Migration: 016_fraud_detection_schema.sql
-- Description: Create fraud detection and security monitoring tables with privacy isolation
-- Dependencies: 015_transaction_isolation_enhancement.sql

BEGIN;

-- Create fraud_events table for storing security incidents
CREATE TABLE IF NOT EXISTS fraud_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context_hash TEXT NOT NULL, -- Isolated card reference, no direct user linkage
    event_type TEXT NOT NULL CHECK (event_type IN (
        'suspicious_transaction',
        'velocity_exceeded',
        'geographic_anomaly',
        'merchant_anomaly',
        'amount_anomaly',
        'pattern_anomaly',
        'ml_high_risk'
    )),
    risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    event_data JSONB NOT NULL, -- Encrypted transaction details and analysis results
    anomalies JSONB, -- Array of detected anomalies with details
    action_taken TEXT NOT NULL CHECK (action_taken IN ('none', 'alert', 'freeze', 'decline')),
    false_positive BOOLEAN, -- User feedback for model improvement
    model_version TEXT, -- ML model version used for scoring
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_fraud_events_card_context ON fraud_events(card_context_hash);
CREATE INDEX idx_fraud_events_detected_at ON fraud_events(detected_at DESC);
CREATE INDEX idx_fraud_events_risk_score ON fraud_events(risk_score) WHERE risk_score >= 50;
CREATE INDEX idx_fraud_events_action_taken ON fraud_events(action_taken) WHERE action_taken != 'none';
CREATE INDEX idx_fraud_events_false_positive ON fraud_events(false_positive) WHERE false_positive IS NOT NULL;

-- Create card_freeze_history table for tracking security actions
CREATE TABLE IF NOT EXISTS card_freeze_history (
    freeze_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context_hash TEXT NOT NULL,
    freeze_reason TEXT NOT NULL CHECK (freeze_reason IN (
        'fraud_detected',
        'user_requested',
        'suspicious_activity',
        'compliance_required',
        'system_initiated'
    )),
    freeze_type TEXT NOT NULL CHECK (freeze_type IN ('temporary', 'permanent')),
    related_event_id UUID REFERENCES fraud_events(event_id),
    frozen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unfrozen_at TIMESTAMP WITH TIME ZONE,
    unfrozen_by TEXT CHECK (unfrozen_by IN ('user', 'system', 'support', 'timeout')),
    metadata JSONB, -- Additional freeze details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for freeze history
CREATE INDEX idx_card_freeze_history_card ON card_freeze_history(card_context_hash);
CREATE INDEX idx_card_freeze_active ON card_freeze_history(card_context_hash) 
    WHERE unfrozen_at IS NULL;

-- Create fraud_ml_feedback table for model improvement
CREATE TABLE IF NOT EXISTS fraud_ml_feedback (
    feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context_hash TEXT NOT NULL,
    event_id UUID REFERENCES fraud_events(event_id),
    feedback_type TEXT NOT NULL CHECK (feedback_type IN (
        'false_positive',
        'false_negative',
        'correct_detection',
        'severity_adjustment'
    )),
    feedback_data JSONB,
    model_version TEXT NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for ML feedback
CREATE INDEX idx_fraud_ml_feedback_card ON fraud_ml_feedback(card_context_hash);
CREATE INDEX idx_fraud_ml_feedback_event ON fraud_ml_feedback(event_id);
CREATE INDEX idx_fraud_ml_feedback_submitted ON fraud_ml_feedback(submitted_at DESC);

-- Create security_incidents table for incident response tracking
CREATE TABLE IF NOT EXISTS security_incidents (
    incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context_hash TEXT NOT NULL,
    incident_type TEXT NOT NULL CHECK (incident_type IN (
        'fraud_attempt',
        'account_takeover',
        'suspicious_pattern',
        'compliance_violation',
        'system_breach_attempt'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL CHECK (status IN (
        'detected',
        'investigating',
        'mitigated',
        'resolved',
        'escalated'
    )) DEFAULT 'detected',
    related_events UUID[], -- Array of related fraud_events
    incident_data JSONB NOT NULL, -- Encrypted incident details
    response_actions JSONB, -- Array of actions taken
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for security incidents
CREATE INDEX idx_security_incidents_card ON security_incidents(card_context_hash);
CREATE INDEX idx_security_incidents_status ON security_incidents(status) WHERE status != 'resolved';
CREATE INDEX idx_security_incidents_severity ON security_incidents(severity, detected_at DESC);

-- Create fraud_rules_performance table for rule effectiveness tracking
CREATE TABLE IF NOT EXISTS fraud_rules_performance (
    performance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT NOT NULL,
    rule_version TEXT NOT NULL,
    true_positives INTEGER DEFAULT 0,
    false_positives INTEGER DEFAULT 0,
    true_negatives INTEGER DEFAULT 0,
    false_negatives INTEGER DEFAULT 0,
    precision DECIMAL(5,4), -- true_positives / (true_positives + false_positives)
    recall DECIMAL(5,4), -- true_positives / (true_positives + false_negatives)
    f1_score DECIMAL(5,4), -- 2 * (precision * recall) / (precision + recall)
    evaluation_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    evaluation_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for rules performance
CREATE INDEX idx_fraud_rules_performance_period ON fraud_rules_performance(
    evaluation_period_end DESC,
    rule_name
);

-- Apply Row Level Security (RLS) policies for complete isolation
ALTER TABLE fraud_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_freeze_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_ml_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;

-- RLS policy for fraud_events - enforce card context isolation
CREATE POLICY fraud_events_isolation ON fraud_events
    FOR ALL
    USING (card_context_hash = current_setting('app.card_context', true));

-- RLS policy for card_freeze_history
CREATE POLICY card_freeze_isolation ON card_freeze_history
    FOR ALL
    USING (card_context_hash = current_setting('app.card_context', true));

-- RLS policy for fraud_ml_feedback
CREATE POLICY fraud_feedback_isolation ON fraud_ml_feedback
    FOR ALL
    USING (card_context_hash = current_setting('app.card_context', true));

-- RLS policy for security_incidents
CREATE POLICY security_incidents_isolation ON security_incidents
    FOR ALL
    USING (card_context_hash = current_setting('app.card_context', true));

-- Note: fraud_rules_performance is not isolated as it contains aggregate metrics only

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER update_fraud_events_updated_at BEFORE UPDATE ON fraud_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_security_incidents_updated_at BEFORE UPDATE ON security_incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to calculate rule performance metrics
CREATE OR REPLACE FUNCTION calculate_rule_performance_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate precision
    IF (NEW.true_positives + NEW.false_positives) > 0 THEN
        NEW.precision = NEW.true_positives::DECIMAL / (NEW.true_positives + NEW.false_positives);
    ELSE
        NEW.precision = 0;
    END IF;
    
    -- Calculate recall
    IF (NEW.true_positives + NEW.false_negatives) > 0 THEN
        NEW.recall = NEW.true_positives::DECIMAL / (NEW.true_positives + NEW.false_negatives);
    ELSE
        NEW.recall = 0;
    END IF;
    
    -- Calculate F1 score
    IF (NEW.precision + NEW.recall) > 0 THEN
        NEW.f1_score = 2 * (NEW.precision * NEW.recall) / (NEW.precision + NEW.recall);
    ELSE
        NEW.f1_score = 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic metric calculation
CREATE TRIGGER calculate_performance_metrics BEFORE INSERT OR UPDATE ON fraud_rules_performance
    FOR EACH ROW EXECUTE FUNCTION calculate_rule_performance_metrics();

-- Create view for active card freezes (privacy-preserved)
CREATE VIEW active_card_freezes AS
SELECT 
    freeze_id,
    card_context_hash,
    freeze_reason,
    frozen_at,
    CASE 
        WHEN freeze_type = 'temporary' AND frozen_at < NOW() - INTERVAL '24 hours' 
        THEN 'pending_review'
        ELSE 'active'
    END as freeze_status
FROM card_freeze_history
WHERE unfrozen_at IS NULL;

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON fraud_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON card_freeze_history TO authenticated;
GRANT SELECT, INSERT ON fraud_ml_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE ON security_incidents TO authenticated;
GRANT SELECT ON fraud_rules_performance TO authenticated;
GRANT SELECT ON active_card_freezes TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE fraud_events IS 'Stores fraud detection events with complete card isolation';
COMMENT ON TABLE card_freeze_history IS 'Tracks card freeze/unfreeze actions for security';
COMMENT ON TABLE fraud_ml_feedback IS 'Stores user feedback for ML model improvement';
COMMENT ON TABLE security_incidents IS 'Tracks security incidents and response actions';
COMMENT ON TABLE fraud_rules_performance IS 'Aggregate metrics for fraud detection rule effectiveness';
COMMENT ON COLUMN fraud_events.card_context_hash IS 'Cryptographic hash ensuring card isolation - no user correlation';
COMMENT ON COLUMN fraud_events.event_data IS 'Encrypted transaction and analysis details';
COMMENT ON COLUMN fraud_events.false_positive IS 'User feedback indicating incorrect fraud detection';

COMMIT;