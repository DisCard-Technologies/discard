-- Migration 013: Transaction History Privacy Enhancements
-- Adds indexes and retention fields for privacy-preserving transaction history

-- Add retention policy tracking to transactions
ALTER TABLE transactions 
ADD COLUMN retention_until TIMESTAMP WITH TIME ZONE;

-- Update retention timestamps for existing records (365 days from created date)
UPDATE transactions 
SET retention_until = created_at + INTERVAL '365 days'
WHERE retention_until IS NULL;

-- Make retention_until not null for future records
ALTER TABLE transactions 
ALTER COLUMN retention_until SET DEFAULT (NOW() + INTERVAL '365 days');

-- Add performance indexes for transaction history queries
CREATE INDEX IF NOT EXISTS idx_transactions_card_date 
ON transactions(card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_merchant_search 
ON transactions(card_id, lower(merchant_name));

CREATE INDEX IF NOT EXISTS idx_transactions_amount_range 
ON transactions(card_id, amount_usd);

CREATE INDEX IF NOT EXISTS idx_transactions_category_search
ON transactions(card_id, merchant_category);

CREATE INDEX IF NOT EXISTS idx_transactions_retention
ON transactions(retention_until);

-- Create table for tracking transaction disputes/refunds
CREATE TABLE IF NOT EXISTS transaction_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  dispute_type VARCHAR(50) NOT NULL CHECK (dispute_type IN ('chargeback', 'refund', 'unauthorized')),
  amount INTEGER NOT NULL, -- Amount in cents
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'resolved')),
  reason TEXT,
  initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policy for transaction disputes
ALTER TABLE transaction_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY transaction_disputes_isolation ON transaction_disputes
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM transactions pt 
    WHERE pt.id = transaction_disputes.transaction_id 
    AND pt.card_id = current_setting('rls.card_id')::UUID
  )
);

-- Create compliance archive table for minimal data retention
CREATE TABLE IF NOT EXISTS compliance_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL, -- Reference only, not FK since original will be deleted
  amount INTEGER NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  compliance_ref VARCHAR(255) NOT NULL, -- Hashed reference for compliance
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  retention_until TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2555 days') -- 7 years
);

-- Index for compliance queries
CREATE INDEX IF NOT EXISTS idx_compliance_archive_ref
ON compliance_archive(compliance_ref);

CREATE INDEX IF NOT EXISTS idx_compliance_archive_retention
ON compliance_archive(retention_until);

-- Create data deletion audit table
CREATE TABLE IF NOT EXISTS data_deletion_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deletion_id UUID,
  action_type VARCHAR(50) NOT NULL DEFAULT 'data_deletion' CHECK (action_type IN ('data_deletion', 'retention_extended', 'kms_key_deleted')),
  target_id UUID, -- Transaction ID or context hash
  context_hash VARCHAR(255),
  deletion_proof TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  verification_hash VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_data_deletion_audit_deletion_id
ON data_deletion_audit(deletion_id);

CREATE INDEX IF NOT EXISTS idx_data_deletion_audit_context
ON data_deletion_audit(context_hash);

CREATE INDEX IF NOT EXISTS idx_data_deletion_audit_created
ON data_deletion_audit(created_at);

-- Create KMS deletion schedule table
CREATE TABLE IF NOT EXISTS kms_deletion_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kms_key_id VARCHAR(255) NOT NULL,
  scheduled_deletion_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for KMS deletion tracking
CREATE INDEX IF NOT EXISTS idx_kms_deletion_schedule_date
ON kms_deletion_schedule(scheduled_deletion_date) WHERE status = 'pending';

-- Add trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_transaction_disputes_updated_at 
BEFORE UPDATE ON transaction_disputes 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kms_deletion_schedule_updated_at 
BEFORE UPDATE ON kms_deletion_schedule 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to set default retention policy for new transactions
CREATE OR REPLACE FUNCTION set_transaction_retention()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.retention_until IS NULL THEN
        NEW.retention_until := NEW.created_at + INTERVAL '365 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_transaction_retention_trigger
BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION set_transaction_retention();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON transaction_disputes TO authenticated;
GRANT SELECT ON compliance_archive TO authenticated;
GRANT SELECT, INSERT ON data_deletion_audit TO authenticated;
GRANT ALL ON kms_deletion_schedule TO authenticated;