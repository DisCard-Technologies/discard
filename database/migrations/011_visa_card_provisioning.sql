-- Migration 011: Visa Card Provisioning & Marqeta Integration
-- Extends card system with Visa network integration via Marqeta,
-- merchant restrictions, and real-time card provisioning capabilities

-- Visa card details table for Marqeta integration
CREATE TABLE visa_card_details (
    visa_card_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
    card_context TEXT NOT NULL, -- Privacy isolation key
    marqeta_card_token TEXT NOT NULL UNIQUE, -- Marqeta card token
    encrypted_card_number TEXT NOT NULL, -- AES-256 encrypted full PAN
    encrypted_cvv TEXT NOT NULL, -- AES-256 encrypted CVV
    expiration_month INTEGER NOT NULL CHECK (expiration_month BETWEEN 1 AND 12),
    expiration_year INTEGER NOT NULL CHECK (expiration_year >= EXTRACT(YEAR FROM NOW())),
    bin_number TEXT NOT NULL DEFAULT '554948', -- Marqeta sandbox BIN
    card_network TEXT NOT NULL DEFAULT 'VISA' CHECK (card_network IN ('VISA', 'MASTERCARD')),
    provisioning_status TEXT NOT NULL DEFAULT 'pending' CHECK (provisioning_status IN ('pending', 'active', 'suspended', 'terminated')),
    last_four_digits TEXT NOT NULL CHECK (LENGTH(last_four_digits) = 4),
    activation_date TIMESTAMP WITH TIME ZONE,
    deactivation_date TIMESTAMP WITH TIME ZONE,
    network_registration_id TEXT, -- Visa network registration ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Merchant restrictions for geographic and category controls
CREATE TABLE merchant_restrictions (
    restriction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context TEXT NOT NULL, -- Privacy isolation key
    restriction_type TEXT NOT NULL CHECK (restriction_type IN ('geographic', 'merchant_category', 'merchant_name')),
    restriction_value TEXT NOT NULL, -- Country code, MCC, or merchant name
    is_allowed BOOLEAN NOT NULL DEFAULT false, -- true = allow only these, false = block these
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Card provisioning status tracking
CREATE TABLE card_provisioning_status (
    status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context TEXT NOT NULL, -- Privacy isolation key
    marqeta_card_token TEXT NOT NULL,
    provisioning_step TEXT NOT NULL CHECK (provisioning_step IN ('card_creation', 'activation', 'network_registration', 'ready')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    error_code TEXT,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Authorization holds for transaction processing
CREATE TABLE authorization_holds (
    hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context TEXT NOT NULL, -- Privacy isolation key
    marqeta_transaction_token TEXT NOT NULL UNIQUE,
    merchant_name TEXT NOT NULL,
    merchant_category_code TEXT NOT NULL, -- MCC code
    authorization_amount DECIMAL(10,2) NOT NULL, -- Amount in cents
    hold_amount DECIMAL(10,2) NOT NULL, -- Amount actually held
    currency_code TEXT NOT NULL DEFAULT 'USD',
    authorization_code TEXT,
    network_reference_id TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cleared', 'expired', 'reversed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cleared_at TIMESTAMP WITH TIME ZONE
);

-- Network connectivity monitoring
CREATE TABLE network_status_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_name TEXT NOT NULL CHECK (network_name IN ('marqeta', 'visa')),
    endpoint_url TEXT NOT NULL,
    response_time_ms INTEGER,
    status_code INTEGER,
    is_healthy BOOLEAN NOT NULL,
    error_message TEXT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX idx_visa_card_details_card_id ON visa_card_details(card_id);
CREATE INDEX idx_visa_card_details_card_context ON visa_card_details(card_context);
CREATE INDEX idx_visa_card_details_marqeta_token ON visa_card_details(marqeta_card_token);
CREATE INDEX idx_visa_card_details_status ON visa_card_details(provisioning_status);

CREATE INDEX idx_merchant_restrictions_card_context ON merchant_restrictions(card_context);
CREATE INDEX idx_merchant_restrictions_type ON merchant_restrictions(restriction_type);
CREATE INDEX idx_merchant_restrictions_expires ON merchant_restrictions(expires_at);

CREATE INDEX idx_card_provisioning_status_context ON card_provisioning_status(card_context);
CREATE INDEX idx_card_provisioning_status_token ON card_provisioning_status(marqeta_card_token);
CREATE INDEX idx_card_provisioning_status_step ON card_provisioning_status(provisioning_step);

CREATE INDEX idx_authorization_holds_context ON authorization_holds(card_context);
CREATE INDEX idx_authorization_holds_token ON authorization_holds(marqeta_transaction_token);
CREATE INDEX idx_authorization_holds_expires ON authorization_holds(expires_at);
CREATE INDEX idx_authorization_holds_status ON authorization_holds(status);

CREATE INDEX idx_network_status_log_network ON network_status_log(network_name);
CREATE INDEX idx_network_status_log_checked ON network_status_log(checked_at);

-- Row Level Security (RLS) policies for privacy isolation
ALTER TABLE visa_card_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_provisioning_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_holds ENABLE ROW LEVEL SECURITY;

-- RLS policy for visa_card_details
CREATE POLICY visa_card_details_isolation ON visa_card_details
    FOR ALL USING (card_context = current_setting('app.current_card_context', true));

-- RLS policy for merchant_restrictions
CREATE POLICY merchant_restrictions_isolation ON merchant_restrictions
    FOR ALL USING (card_context = current_setting('app.current_card_context', true));

-- RLS policy for card_provisioning_status
CREATE POLICY card_provisioning_status_isolation ON card_provisioning_status
    FOR ALL USING (card_context = current_setting('app.current_card_context', true));

-- RLS policy for authorization_holds
CREATE POLICY authorization_holds_isolation ON authorization_holds
    FOR ALL USING (card_context = current_setting('app.current_card_context', true));

-- Network status log accessible to all (no privacy concerns)
ALTER TABLE network_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY network_status_log_read_all ON network_status_log
    FOR SELECT USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for visa_card_details updated_at
CREATE TRIGGER update_visa_card_details_updated_at
    BEFORE UPDATE ON visa_card_details
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically expire old authorization holds
CREATE OR REPLACE FUNCTION expire_authorization_holds()
RETURNS void AS $$
BEGIN
    UPDATE authorization_holds
    SET status = 'expired'
    WHERE status = 'active'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE visa_card_details IS 'Stores Visa card details and Marqeta integration data with encryption';
COMMENT ON TABLE merchant_restrictions IS 'Geographic and merchant category restrictions for card usage';
COMMENT ON TABLE card_provisioning_status IS 'Tracks card provisioning workflow status';
COMMENT ON TABLE authorization_holds IS 'Manages authorization holds during transaction processing';
COMMENT ON TABLE network_status_log IS 'Monitors network connectivity and performance';

COMMENT ON COLUMN visa_card_details.marqeta_card_token IS 'Unique token from Marqeta API for card reference';
COMMENT ON COLUMN visa_card_details.encrypted_card_number IS 'AES-256 encrypted full PAN - never stored in plaintext';
COMMENT ON COLUMN visa_card_details.bin_number IS 'Bank Identification Number - 554948 for Marqeta sandbox';
COMMENT ON COLUMN merchant_restrictions.is_allowed IS 'true=allow only these values, false=block these values';
COMMENT ON COLUMN authorization_holds.authorization_amount IS 'Original authorization amount in cents';
COMMENT ON COLUMN authorization_holds.hold_amount IS 'Actual amount held (may differ from auth amount)';