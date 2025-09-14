-- Migration 014: Secure Card Deletion & Data Destruction
-- Enhances card deletion with cryptographic proof generation, network notification tracking,
-- compliance audit trails, and comprehensive deletion verification

-- Add new columns to cards table for deletion tracking
ALTER TABLE cards ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS deletion_proof_hash TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS network_cancellation_status TEXT 
  CHECK (network_cancellation_status IN ('pending', 'confirmed', 'failed'));

-- Add new columns to visa_card_details for enhanced deletion tracking
ALTER TABLE visa_card_details ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE visa_card_details ADD COLUMN IF NOT EXISTS network_cancellation_confirmed_at TIMESTAMP WITH TIME ZONE;

-- Enhanced deletion proofs table
CREATE TABLE IF NOT EXISTS deletion_proofs (
    deletion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context_hash TEXT NOT NULL,
    card_id UUID NOT NULL, -- Maintain reference for compliance but will be wiped after deletion
    deletion_proof_hash TEXT NOT NULL,
    kms_key_deletion_scheduled_at TIMESTAMP WITH TIME ZONE,
    network_cancellation_confirmed_at TIMESTAMP WITH TIME ZONE,
    data_overwrite_confirmed_at TIMESTAMP WITH TIME ZONE,
    verification_data JSONB NOT NULL DEFAULT '{}', -- Stores deletion verification metadata
    deletion_type TEXT NOT NULL DEFAULT 'single' CHECK (deletion_type IN ('single', 'bulk')),
    deletion_initiated_by UUID REFERENCES users(id), -- User who initiated deletion
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Network cancellation tracking table
CREATE TABLE IF NOT EXISTS network_cancellation_log (
    cancellation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_context_hash TEXT NOT NULL,
    marqeta_card_token TEXT NOT NULL,
    cancellation_request_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cancellation_confirmed_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled')),
    error_message TEXT,
    network_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bulk deletion coordination table
CREATE TABLE IF NOT EXISTS bulk_deletion_batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiated_by UUID NOT NULL REFERENCES users(id),
    total_cards INTEGER NOT NULL CHECK (total_cards > 0),
    completed_cards INTEGER NOT NULL DEFAULT 0 CHECK (completed_cards >= 0),
    failed_cards INTEGER NOT NULL DEFAULT 0 CHECK (failed_cards >= 0),
    batch_status TEXT NOT NULL DEFAULT 'in_progress' CHECK (batch_status IN ('in_progress', 'completed', 'partially_failed', 'failed')),
    deletion_scheduled_for TIMESTAMP WITH TIME ZONE, -- For delayed deletion
    confirmation_phrase TEXT NOT NULL,
    impact_summary JSONB NOT NULL DEFAULT '{}', -- Summary of affected data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Individual card deletion tracking within bulk operations
CREATE TABLE IF NOT EXISTS bulk_deletion_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES bulk_deletion_batches(batch_id) ON DELETE CASCADE,
    card_context_hash TEXT NOT NULL,
    card_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    deletion_proof_hash TEXT,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced compliance audit for deletion events
ALTER TABLE data_deletion_audit 
ADD COLUMN IF NOT EXISTS deletion_certificate_url TEXT,
ADD COLUMN IF NOT EXISTS compliance_retention_until TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2555 days'), -- 7 years
ADD COLUMN IF NOT EXISTS audit_trail_integrity_hash TEXT,
ADD COLUMN IF NOT EXISTS bulk_batch_id UUID REFERENCES bulk_deletion_batches(batch_id);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_cards_deleted_at ON cards(deleted_at);
CREATE INDEX IF NOT EXISTS idx_cards_deletion_status ON cards(status) WHERE status = 'deleted';
CREATE INDEX IF NOT EXISTS idx_cards_network_cancellation ON cards(network_cancellation_status);

CREATE INDEX IF NOT EXISTS idx_deletion_proofs_context ON deletion_proofs(card_context_hash);
CREATE INDEX IF NOT EXISTS idx_deletion_proofs_created ON deletion_proofs(created_at);
CREATE INDEX IF NOT EXISTS idx_deletion_proofs_type ON deletion_proofs(deletion_type);

CREATE INDEX IF NOT EXISTS idx_network_cancellation_log_token ON network_cancellation_log(marqeta_card_token);
CREATE INDEX IF NOT EXISTS idx_network_cancellation_log_status ON network_cancellation_log(status);
CREATE INDEX IF NOT EXISTS idx_network_cancellation_log_retry ON network_cancellation_log(next_retry_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_bulk_deletion_batches_user ON bulk_deletion_batches(initiated_by);
CREATE INDEX IF NOT EXISTS idx_bulk_deletion_batches_status ON bulk_deletion_batches(batch_status);
CREATE INDEX IF NOT EXISTS idx_bulk_deletion_batches_scheduled ON bulk_deletion_batches(deletion_scheduled_for) WHERE deletion_scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bulk_deletion_items_batch ON bulk_deletion_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_bulk_deletion_items_status ON bulk_deletion_items(status);
CREATE INDEX IF NOT EXISTS idx_bulk_deletion_items_card ON bulk_deletion_items(card_context_hash);

-- Enhanced indexes for compliance audit
CREATE INDEX IF NOT EXISTS idx_data_deletion_audit_batch ON data_deletion_audit(bulk_batch_id);
CREATE INDEX IF NOT EXISTS idx_data_deletion_audit_retention ON data_deletion_audit(compliance_retention_until) WHERE compliance_retention_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_deletion_audit_integrity ON data_deletion_audit(audit_trail_integrity_hash);

-- Row Level Security (RLS) policies
ALTER TABLE deletion_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_cancellation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_deletion_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_deletion_items ENABLE ROW LEVEL SECURITY;

-- RLS policy for deletion_proofs - users can only see proofs for their own cards
CREATE POLICY deletion_proofs_isolation ON deletion_proofs
FOR ALL 
USING (
  deletion_initiated_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM cards c 
    WHERE c.card_context_hash = deletion_proofs.card_context_hash 
    AND c.user_id = auth.uid()
  )
);

-- RLS policy for network_cancellation_log
CREATE POLICY network_cancellation_log_isolation ON network_cancellation_log
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM cards c 
    WHERE c.card_context_hash = network_cancellation_log.card_context_hash 
    AND c.user_id = auth.uid()
  )
);

-- RLS policy for bulk_deletion_batches - users can only see their own batches
CREATE POLICY bulk_deletion_batches_isolation ON bulk_deletion_batches
FOR ALL
USING (initiated_by = auth.uid());

-- RLS policy for bulk_deletion_items - users can only see items from their own batches
CREATE POLICY bulk_deletion_items_isolation ON bulk_deletion_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM bulk_deletion_batches b 
    WHERE b.batch_id = bulk_deletion_items.batch_id 
    AND b.initiated_by = auth.uid()
  )
);

-- Enhanced triggers for updated_at timestamps
CREATE TRIGGER update_deletion_proofs_updated_at
BEFORE UPDATE ON deletion_proofs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bulk_deletion_batches_updated_at
BEFORE UPDATE ON bulk_deletion_batches
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update bulk deletion batch status
CREATE OR REPLACE FUNCTION update_bulk_deletion_batch_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the parent batch when an item status changes
  UPDATE bulk_deletion_batches 
  SET 
    completed_cards = (
      SELECT COUNT(*) FROM bulk_deletion_items 
      WHERE batch_id = NEW.batch_id AND status = 'completed'
    ),
    failed_cards = (
      SELECT COUNT(*) FROM bulk_deletion_items 
      WHERE batch_id = NEW.batch_id AND status = 'failed'
    ),
    updated_at = NOW()
  WHERE batch_id = NEW.batch_id;
  
  -- Update batch status based on item completion
  UPDATE bulk_deletion_batches 
  SET 
    batch_status = CASE
      WHEN completed_cards = total_cards THEN 'completed'
      WHEN completed_cards + failed_cards = total_cards AND failed_cards > 0 THEN 'partially_failed'
      WHEN failed_cards = total_cards THEN 'failed'
      ELSE 'in_progress'
    END,
    completed_at = CASE 
      WHEN completed_cards + failed_cards = total_cards THEN NOW()
      ELSE completed_at
    END,
    updated_at = NOW()
  WHERE batch_id = NEW.batch_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update batch status when items change
CREATE TRIGGER update_bulk_deletion_batch_status_trigger
AFTER INSERT OR UPDATE ON bulk_deletion_items
FOR EACH ROW
EXECUTE FUNCTION update_bulk_deletion_batch_status();

-- Function to generate deletion proof hash
CREATE OR REPLACE FUNCTION generate_deletion_proof_hash(
  p_card_context_hash TEXT,
  p_kms_key_deleted BOOLEAN DEFAULT false,
  p_data_overwritten BOOLEAN DEFAULT false,
  p_network_cancelled BOOLEAN DEFAULT false
)
RETURNS TEXT AS $$
DECLARE
  proof_data JSONB;
  proof_hash TEXT;
BEGIN
  -- Create proof data structure
  proof_data := jsonb_build_object(
    'card_context_hash', p_card_context_hash,
    'deletion_timestamp', NOW(),
    'kms_key_deleted', p_kms_key_deleted,
    'data_overwritten', p_data_overwritten,
    'network_cancelled', p_network_cancelled,
    'verification_salt', gen_random_uuid()
  );
  
  -- Generate SHA-256 hash of proof data
  proof_hash := encode(sha256(proof_data::text::bytea), 'hex');
  
  RETURN proof_hash;
END;
$$ LANGUAGE plpgsql;

-- Function to schedule card deletion cleanup (removes card references after compliance period)
CREATE OR REPLACE FUNCTION schedule_card_data_cleanup()
RETURNS INTEGER AS $$
DECLARE
  cleanup_count INTEGER := 0;
BEGIN
  -- Remove card_id references from deletion_proofs after compliance retention
  UPDATE deletion_proofs 
  SET card_id = NULL
  WHERE card_id IS NOT NULL 
  AND created_at < NOW() - INTERVAL '2555 days'; -- 7 years
  
  GET DIAGNOSTICS cleanup_count = ROW_COUNT;
  
  -- Clean up old network cancellation logs (keep for 1 year)
  DELETE FROM network_cancellation_log 
  WHERE created_at < NOW() - INTERVAL '365 days';
  
  -- Clean up completed bulk deletion batches (keep for 1 year)
  DELETE FROM bulk_deletion_batches 
  WHERE batch_status IN ('completed', 'failed', 'partially_failed')
  AND completed_at < NOW() - INTERVAL '365 days';
  
  RETURN cleanup_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON deletion_proofs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON network_cancellation_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON bulk_deletion_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON bulk_deletion_items TO authenticated;

-- Comments for documentation
COMMENT ON TABLE deletion_proofs IS 'Cryptographic deletion proofs for verifiable card data destruction';
COMMENT ON TABLE network_cancellation_log IS 'Tracks Marqeta/Visa network cancellation requests and responses';
COMMENT ON TABLE bulk_deletion_batches IS 'Coordinates bulk card deletion operations with progress tracking';
COMMENT ON TABLE bulk_deletion_items IS 'Individual card items within bulk deletion batches';

COMMENT ON COLUMN deletion_proofs.deletion_proof_hash IS 'Cryptographic hash proving card data was properly destroyed';
COMMENT ON COLUMN deletion_proofs.verification_data IS 'Metadata about deletion verification (KMS, overwrite, network status)';
COMMENT ON COLUMN network_cancellation_log.network_response IS 'Full response from Marqeta API for cancellation request';
COMMENT ON COLUMN bulk_deletion_batches.impact_summary IS 'Summary of affected transactions, balances, and services';
COMMENT ON COLUMN bulk_deletion_batches.confirmation_phrase IS 'User-typed confirmation phrase for irreversible action';