-- Migration 005: Card Privacy Isolation
-- Updates cards table for privacy isolation with cryptographic deletion

-- Drop existing cards table to recreate with new schema
DROP TABLE IF EXISTS cards CASCADE;

-- Create deletion log table for cryptographic verification
CREATE TABLE IF NOT EXISTS deletion_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    card_id UUID NOT NULL,
    deletion_key VARCHAR(255) NOT NULL,
    deletion_proof JSONB NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create cards table with privacy isolation
CREATE TABLE cards (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    card_id UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_context_hash VARCHAR(255) NOT NULL, -- Cryptographic isolation key
    encrypted_card_number TEXT NOT NULL, -- AES-256 encrypted
    encrypted_cvv TEXT NOT NULL, -- AES-256 encrypted
    expiration_date VARCHAR(4) NOT NULL, -- MMYY
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired', 'deleted')),
    spending_limit INTEGER NOT NULL CHECK (spending_limit >= 100 AND spending_limit <= 500000), -- Cents
    current_balance INTEGER DEFAULT 0 CHECK (current_balance >= 0), -- Cents
    merchant_restrictions JSONB, -- Category codes array
    deletion_key VARCHAR(255) NOT NULL, -- Cryptographic deletion verification
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance and privacy isolation
CREATE INDEX idx_cards_card_id ON cards(card_id);
CREATE INDEX idx_cards_user_id ON cards(user_id);
CREATE INDEX idx_cards_context_hash ON cards(card_context_hash);
CREATE INDEX idx_cards_status ON cards(status);
CREATE INDEX idx_cards_created_at ON cards(created_at);
CREATE INDEX idx_cards_expires_at ON cards(expires_at);

CREATE INDEX idx_deletion_log_card_id ON deletion_log(card_id);
CREATE INDEX idx_deletion_log_deleted_at ON deletion_log(deleted_at);

-- Enable Row Level Security for privacy isolation
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for cards - users can only access their own cards
CREATE POLICY "Users can view own cards with context isolation" 
  ON cards FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cards with context isolation" 
  ON cards FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cards with context isolation" 
  ON cards FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cards with context isolation" 
  ON cards FOR DELETE 
  USING (auth.uid() = user_id);

-- RLS policies for deletion log - users can only view their own deletion records
CREATE POLICY "Users can view own card deletion logs" 
  ON deletion_log FOR SELECT 
  USING (auth.uid() = (SELECT user_id FROM cards WHERE card_id = deletion_log.card_id));

CREATE POLICY "System can insert deletion logs" 
  ON deletion_log FOR INSERT 
  WITH CHECK (true); -- Allow system to insert deletion records

-- Updated triggers for cards table
CREATE TRIGGER update_cards_updated_at 
  BEFORE UPDATE ON cards
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Function to enforce card context isolation
CREATE OR REPLACE FUNCTION enforce_card_context_isolation()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure card_context_hash is unique per user for privacy isolation
  IF EXISTS (
    SELECT 1 FROM cards 
    WHERE user_id = NEW.user_id 
    AND card_context_hash = NEW.card_context_hash 
    AND card_id != NEW.card_id
  ) THEN
    RAISE EXCEPTION 'Card context hash collision detected';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce context isolation
CREATE TRIGGER enforce_card_context_isolation_trigger
  BEFORE INSERT OR UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION enforce_card_context_isolation();

-- Function to automatically expire cards
CREATE OR REPLACE FUNCTION auto_expire_cards()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER := 0;
BEGIN
  UPDATE cards 
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active' 
    AND expires_at < NOW();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Update transactions table to work with new card structure
ALTER TABLE transactions 
  DROP CONSTRAINT IF EXISTS transactions_card_id_fkey;

ALTER TABLE transactions 
  ADD CONSTRAINT transactions_card_id_fkey 
  FOREIGN KEY (card_id) 
  REFERENCES cards(card_id) 
  ON DELETE CASCADE;

-- Update card_funding table to work with new card structure
ALTER TABLE card_funding 
  DROP CONSTRAINT IF EXISTS card_funding_card_id_fkey;

ALTER TABLE card_funding 
  ADD CONSTRAINT card_funding_card_id_fkey 
  FOREIGN KEY (card_id) 
  REFERENCES cards(card_id) 
  ON DELETE CASCADE;

-- Comments for documentation
COMMENT ON TABLE cards IS 'Privacy-isolated virtual cards with cryptographic deletion support';
COMMENT ON COLUMN cards.card_id IS 'Unique card identifier used in API and references';
COMMENT ON COLUMN cards.card_context_hash IS 'Cryptographic isolation context for privacy protection';
COMMENT ON COLUMN cards.encrypted_card_number IS 'AES-256 encrypted card number';
COMMENT ON COLUMN cards.encrypted_cvv IS 'AES-256 encrypted CVV';
COMMENT ON COLUMN cards.spending_limit IS 'Spending limit in cents (100-500000)';
COMMENT ON COLUMN cards.current_balance IS 'Current balance in cents';
COMMENT ON COLUMN cards.deletion_key IS 'Cryptographic key for verifiable deletion';

COMMENT ON TABLE deletion_log IS 'Audit trail for cryptographic card deletion verification';
COMMENT ON COLUMN deletion_log.deletion_proof IS 'Cryptographic proof of card deletion';