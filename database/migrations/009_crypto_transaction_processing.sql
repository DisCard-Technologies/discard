-- Migration 009: Cryptocurrency Transaction Processing Schema
-- Story 2.3: Cryptocurrency Transaction Processing
-- Author: James (Dev Agent)
-- Date: 2025-08-07

-- Transaction Processing Log Table
CREATE TABLE transaction_processing_log (
    processing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES crypto_transactions(transaction_id),
    blockchain_tx_hash VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('initiated', 'pending', 'confirming', 'confirmed', 'failed', 'refunded')),
    confirmation_count INTEGER NOT NULL DEFAULT 0,
    required_confirmations INTEGER NOT NULL,
    network_fee_estimate INTEGER NOT NULL, -- cents
    estimated_completion TIMESTAMP WITH TIME ZONE NOT NULL,
    locked_conversion_rate DECIMAL(20, 8) NOT NULL,
    network_type VARCHAR(10) NOT NULL CHECK (network_type IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP')),
    acceleration_options JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Row-level security context
    card_id UUID NOT NULL,
    
    -- Indexes for performance
    CONSTRAINT fk_transaction_processing_card FOREIGN KEY (card_id) REFERENCES cards(card_id)
);

-- Network Fee Estimates Table
CREATE TABLE network_fee_estimates (
    estimate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_type VARCHAR(10) NOT NULL CHECK (network_type IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP')),
    fee_level VARCHAR(10) NOT NULL CHECK (fee_level IN ('slow', 'standard', 'fast')),
    fee_per_unit DECIMAL(20, 8) NOT NULL, -- Fee per byte (BTC) or gas price (ETH)
    estimated_confirmation_time INTEGER NOT NULL, -- minutes
    network_congestion_level VARCHAR(10) NOT NULL CHECK (network_congestion_level IN ('low', 'medium', 'high')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Unique constraint for current estimates
    CONSTRAINT unique_current_fee_estimate UNIQUE (network_type, fee_level, created_at)
);

-- Refund Transactions Table
CREATE TABLE refund_transactions (
    refund_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_transaction_id UUID NOT NULL REFERENCES crypto_transactions(transaction_id),
    refund_amount DECIMAL(20, 8) NOT NULL,
    refund_address VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    reason TEXT NOT NULL,
    blockchain_refund_hash VARCHAR(128),
    processed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Row-level security context
    card_id UUID NOT NULL,
    
    CONSTRAINT fk_refund_transactions_card FOREIGN KEY (card_id) REFERENCES cards(card_id)
);

-- Performance Indexes
CREATE INDEX idx_transaction_processing_log_card_id ON transaction_processing_log(card_id);
CREATE INDEX idx_transaction_processing_log_status ON transaction_processing_log(status);
CREATE INDEX idx_transaction_processing_log_blockchain_hash ON transaction_processing_log(blockchain_tx_hash);
CREATE INDEX idx_transaction_processing_log_created_at ON transaction_processing_log(created_at);
CREATE INDEX idx_transaction_processing_log_network_type ON transaction_processing_log(network_type);

CREATE INDEX idx_network_fee_estimates_network_type ON network_fee_estimates(network_type);
CREATE INDEX idx_network_fee_estimates_valid_until ON network_fee_estimates(valid_until);
CREATE INDEX idx_network_fee_estimates_created_at ON network_fee_estimates(created_at);

CREATE INDEX idx_refund_transactions_card_id ON refund_transactions(card_id);
CREATE INDEX idx_refund_transactions_original_transaction_id ON refund_transactions(original_transaction_id);
CREATE INDEX idx_refund_transactions_status ON refund_transactions(status);

-- Row-Level Security Policies
ALTER TABLE transaction_processing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_transactions ENABLE ROW LEVEL SECURITY;

-- Transaction processing log policies
CREATE POLICY transaction_processing_log_select_policy ON transaction_processing_log
    FOR SELECT USING (card_id = current_setting('rls.card_id')::UUID);

CREATE POLICY transaction_processing_log_insert_policy ON transaction_processing_log
    FOR INSERT WITH CHECK (card_id = current_setting('rls.card_id')::UUID);

CREATE POLICY transaction_processing_log_update_policy ON transaction_processing_log
    FOR UPDATE USING (card_id = current_setting('rls.card_id')::UUID);

-- Refund transactions policies
CREATE POLICY refund_transactions_select_policy ON refund_transactions
    FOR SELECT USING (card_id = current_setting('rls.card_id')::UUID);

CREATE POLICY refund_transactions_insert_policy ON refund_transactions
    FOR INSERT WITH CHECK (card_id = current_setting('rls.card_id')::UUID);

CREATE POLICY refund_transactions_update_policy ON refund_transactions
    FOR UPDATE USING (card_id = current_setting('rls.card_id')::UUID);

-- Data retention policies (delete processing logs older than 2 years)
CREATE OR REPLACE FUNCTION cleanup_old_transaction_processing_logs() RETURNS void AS $$
BEGIN
    DELETE FROM transaction_processing_log 
    WHERE created_at < NOW() - INTERVAL '2 years';
    
    DELETE FROM network_fee_estimates 
    WHERE valid_until < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transaction_processing_log_updated_at
    BEFORE UPDATE ON transaction_processing_log
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refund_transactions_updated_at
    BEFORE UPDATE ON refund_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE transaction_processing_log IS 'Detailed tracking of cryptocurrency transaction processing with blockchain confirmations';
COMMENT ON TABLE network_fee_estimates IS 'Dynamic fee estimates for different cryptocurrency networks';
COMMENT ON TABLE refund_transactions IS 'Automated refund processing for failed cryptocurrency transactions';