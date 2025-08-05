-- Migration 006: Funding Schema
-- Adds funding, balance management, and payment processing tables

-- Create account_balances table with cryptographic isolation
CREATE TABLE account_balances (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance_context_hash VARCHAR(255) NOT NULL, -- Cryptographic isolation key
    total_balance INTEGER DEFAULT 0 CHECK (total_balance >= 0), -- Total balance in cents
    allocated_balance INTEGER DEFAULT 0 CHECK (allocated_balance >= 0), -- Balance allocated to cards in cents
    available_balance INTEGER GENERATED ALWAYS AS (total_balance - allocated_balance) STORED, -- Available balance in cents
    encrypted_balance_details TEXT, -- AES-256 encrypted balance breakdown
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure balance consistency
    CONSTRAINT balance_consistency CHECK (allocated_balance <= total_balance)
);

-- Create funding_transactions table for transaction tracking
CREATE TABLE funding_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    transaction_id VARCHAR(64) UNIQUE NOT NULL, -- Unique transaction identifier
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_context_hash VARCHAR(255) NOT NULL, -- Cryptographic isolation key
    type VARCHAR(20) NOT NULL CHECK (type IN ('account_funding', 'card_allocation', 'card_transfer')),
    amount INTEGER NOT NULL CHECK (amount > 0), -- Amount in cents
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    
    -- Payment method details (for account funding)
    stripe_payment_intent_id VARCHAR(255),
    stripe_payment_method_id VARCHAR(255),
    
    -- Card details (for allocations and transfers)
    source_card_id UUID, -- References cards(card_id) for transfers
    target_card_id UUID, -- References cards(card_id) for allocations and transfers
    
    -- Error and processing details
    error_message TEXT,
    error_code VARCHAR(50),
    processing_time INTEGER DEFAULT 0, -- Estimated processing time in seconds
    stripe_customer_id VARCHAR(255),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    fraud_check_results JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure card references exist when provided
    CONSTRAINT valid_source_card CHECK (
        (type = 'card_transfer' AND source_card_id IS NOT NULL) OR 
        (type != 'card_transfer')
    ),
    CONSTRAINT valid_target_card CHECK (
        (type IN ('card_allocation', 'card_transfer') AND target_card_id IS NOT NULL) OR 
        (type = 'account_funding')
    ),
    CONSTRAINT valid_stripe_details CHECK (
        (type = 'account_funding' AND stripe_payment_intent_id IS NOT NULL) OR 
        (type != 'account_funding')
    )
);

-- Create fund_allocations table for card funding records
CREATE TABLE fund_allocations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL, -- References cards(card_id)
    allocation_context_hash VARCHAR(255) NOT NULL, -- Cryptographic isolation key
    amount INTEGER NOT NULL CHECK (amount > 0), -- Amount allocated in cents
    transaction_id UUID NOT NULL REFERENCES funding_transactions(id) ON DELETE CASCADE,
    encrypted_allocation_proof TEXT, -- AES-256 encrypted proof of allocation
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique allocation per transaction
    UNIQUE(transaction_id, card_id)
);

-- Create balance_notification_thresholds table
CREATE TABLE balance_notification_thresholds (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    account_threshold INTEGER DEFAULT 1000 CHECK (account_threshold >= 0), -- Account threshold in cents
    card_threshold INTEGER DEFAULT 500 CHECK (card_threshold >= 0), -- Card threshold in cents
    enable_notifications BOOLEAN DEFAULT true,
    notification_methods JSONB DEFAULT '["email"]', -- Array of notification methods
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create stripe_customers table for customer management
CREATE TABLE stripe_customers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
    default_payment_method_id VARCHAR(255),
    encrypted_customer_data TEXT, -- AES-256 encrypted customer details
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create stripe_webhook_events table for idempotency
CREATE TABLE stripe_webhook_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(255) NOT NULL,
    processed BOOLEAN DEFAULT false,
    event_data JSONB NOT NULL,
    processing_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX idx_account_balances_user_id ON account_balances(user_id);
CREATE INDEX idx_account_balances_context_hash ON account_balances(balance_context_hash);
CREATE INDEX idx_account_balances_last_updated ON account_balances(last_updated);

CREATE INDEX idx_funding_transactions_user_id ON funding_transactions(user_id);
CREATE INDEX idx_funding_transactions_transaction_id ON funding_transactions(transaction_id);
CREATE INDEX idx_funding_transactions_context_hash ON funding_transactions(transaction_context_hash);
CREATE INDEX idx_funding_transactions_type ON funding_transactions(type);
CREATE INDEX idx_funding_transactions_status ON funding_transactions(status);
CREATE INDEX idx_funding_transactions_created_at ON funding_transactions(created_at);
CREATE INDEX idx_funding_transactions_stripe_payment_intent ON funding_transactions(stripe_payment_intent_id);
CREATE INDEX idx_funding_transactions_source_card ON funding_transactions(source_card_id);
CREATE INDEX idx_funding_transactions_target_card ON funding_transactions(target_card_id);

CREATE INDEX idx_fund_allocations_user_id ON fund_allocations(user_id);
CREATE INDEX idx_fund_allocations_card_id ON fund_allocations(card_id);
CREATE INDEX idx_fund_allocations_context_hash ON fund_allocations(allocation_context_hash);
CREATE INDEX idx_fund_allocations_transaction_id ON fund_allocations(transaction_id);
CREATE INDEX idx_fund_allocations_created_at ON fund_allocations(created_at);

CREATE INDEX idx_balance_thresholds_user_id ON balance_notification_thresholds(user_id);

CREATE INDEX idx_stripe_customers_user_id ON stripe_customers(user_id);
CREATE INDEX idx_stripe_customers_stripe_id ON stripe_customers(stripe_customer_id);

CREATE INDEX idx_stripe_webhooks_event_id ON stripe_webhook_events(stripe_event_id);
CREATE INDEX idx_stripe_webhooks_type ON stripe_webhook_events(event_type);
CREATE INDEX idx_stripe_webhooks_processed ON stripe_webhook_events(processed);
CREATE INDEX idx_stripe_webhooks_created_at ON stripe_webhook_events(created_at);

-- Enable Row Level Security for privacy isolation
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_notification_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for account_balances
CREATE POLICY "Users can view own account balance" 
  ON account_balances FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own account balance" 
  ON account_balances FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert account balances" 
  ON account_balances FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- RLS policies for funding_transactions
CREATE POLICY "Users can view own funding transactions" 
  ON funding_transactions FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage funding transactions" 
  ON funding_transactions FOR ALL 
  USING (auth.uid() = user_id);

-- RLS policies for fund_allocations
CREATE POLICY "Users can view own fund allocations" 
  ON fund_allocations FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage fund allocations" 
  ON fund_allocations FOR ALL 
  USING (auth.uid() = user_id);

-- RLS policies for balance_notification_thresholds
CREATE POLICY "Users can manage own notification thresholds" 
  ON balance_notification_thresholds FOR ALL 
  USING (auth.uid() = user_id);

-- RLS policies for stripe_customers
CREATE POLICY "Users can view own Stripe customer data" 
  ON stripe_customers FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage Stripe customers" 
  ON stripe_customers FOR ALL 
  USING (auth.uid() = user_id);

-- RLS policies for stripe_webhook_events (system only)
CREATE POLICY "System can manage webhook events" 
  ON stripe_webhook_events FOR ALL 
  USING (true); -- Allow system-level access for webhook processing

-- Update triggers
CREATE TRIGGER update_account_balances_updated_at 
  BEFORE UPDATE ON account_balances
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_funding_transactions_updated_at 
  BEFORE UPDATE ON funding_transactions
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_balance_thresholds_updated_at 
  BEFORE UPDATE ON balance_notification_thresholds
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_customers_updated_at 
  BEFORE UPDATE ON stripe_customers
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Function to enforce funding transaction context isolation
CREATE OR REPLACE FUNCTION enforce_funding_context_isolation()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure transaction_context_hash is unique per user for privacy isolation
  IF EXISTS (
    SELECT 1 FROM funding_transactions 
    WHERE user_id = NEW.user_id 
    AND transaction_context_hash = NEW.transaction_context_hash 
    AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'Funding transaction context hash collision detected';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce funding context isolation
CREATE TRIGGER enforce_funding_context_isolation_trigger
  BEFORE INSERT OR UPDATE ON funding_transactions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_funding_context_isolation();

-- Function to update card balance after allocation/transfer
CREATE OR REPLACE FUNCTION update_card_balance_after_funding()
RETURNS TRIGGER AS $$
BEGIN
  -- Update card balance for allocation or transfer
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Handle card allocation
    IF NEW.type = 'card_allocation' THEN
      UPDATE cards 
      SET current_balance = current_balance + NEW.amount,
          updated_at = NOW()
      WHERE card_id = NEW.target_card_id;
    END IF;
    
    -- Handle card transfer
    IF NEW.type = 'card_transfer' THEN
      -- Deduct from source card
      UPDATE cards 
      SET current_balance = current_balance - NEW.amount,
          updated_at = NOW()
      WHERE card_id = NEW.source_card_id;
      
      -- Add to target card
      UPDATE cards 
      SET current_balance = current_balance + NEW.amount,
          updated_at = NOW()
      WHERE card_id = NEW.target_card_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update card balances
CREATE TRIGGER update_card_balance_after_funding_trigger
  AFTER UPDATE ON funding_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_card_balance_after_funding();

-- Function to update account balance after funding
CREATE OR REPLACE FUNCTION update_account_balance_after_funding()
RETURNS TRIGGER AS $$
BEGIN
  -- Update account balance for completed transactions
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Handle account funding
    IF NEW.type = 'account_funding' THEN
      UPDATE account_balances 
      SET total_balance = total_balance + NEW.amount,
          last_updated = NOW(),
          updated_at = NOW()
      WHERE user_id = NEW.user_id;
    END IF;
    
    -- Handle card allocation (reduce available balance)
    IF NEW.type = 'card_allocation' THEN
      UPDATE account_balances 
      SET allocated_balance = allocated_balance + NEW.amount,
          last_updated = NOW(),
          updated_at = NOW()
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update account balances
CREATE TRIGGER update_account_balance_after_funding_trigger
  AFTER UPDATE ON funding_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance_after_funding();

-- Comments for documentation
COMMENT ON TABLE account_balances IS 'User account balances with cryptographic isolation';
COMMENT ON COLUMN account_balances.balance_context_hash IS 'Cryptographic isolation context for privacy protection';
COMMENT ON COLUMN account_balances.total_balance IS 'Total account balance in cents';
COMMENT ON COLUMN account_balances.allocated_balance IS 'Balance allocated to cards in cents';
COMMENT ON COLUMN account_balances.available_balance IS 'Available balance for allocation in cents (computed)';

COMMENT ON TABLE funding_transactions IS 'All funding transactions with privacy isolation';
COMMENT ON COLUMN funding_transactions.transaction_context_hash IS 'Cryptographic isolation context';
COMMENT ON COLUMN funding_transactions.type IS 'Transaction type: account_funding, card_allocation, card_transfer';
COMMENT ON COLUMN funding_transactions.amount IS 'Transaction amount in cents';

COMMENT ON TABLE fund_allocations IS 'Card funding allocation records';
COMMENT ON COLUMN fund_allocations.allocation_context_hash IS 'Cryptographic isolation context';
COMMENT ON COLUMN fund_allocations.encrypted_allocation_proof IS 'AES-256 encrypted allocation proof';

COMMENT ON TABLE balance_notification_thresholds IS 'User notification preferences for low balance alerts';
COMMENT ON TABLE stripe_customers IS 'Stripe customer data with encryption';
COMMENT ON TABLE stripe_webhook_events IS 'Stripe webhook event processing log for idempotency';