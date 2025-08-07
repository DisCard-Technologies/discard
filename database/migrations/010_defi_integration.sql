-- Migration 010: DeFi Integration Schema Extensions
-- Extends cryptocurrency transaction processing with DeFi protocol integration,
-- multi-chain bridge support, and advanced transaction batching

-- DeFi positions tracking table
CREATE TABLE defi_positions (
    position_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_context_hash TEXT NOT NULL, -- Privacy-preserving user context
    protocol_name TEXT NOT NULL CHECK (protocol_name IN ('Aave', 'Compound', 'Uniswap', 'SushiSwap')),
    network_type TEXT NOT NULL CHECK (network_type IN ('ETH', 'POLYGON', 'ARBITRUM')),
    position_type TEXT NOT NULL CHECK (position_type IN ('lending', 'liquidity_pool', 'yield_farming')),
    underlying_assets JSONB NOT NULL, -- Array of AssetPosition objects
    current_yield DECIMAL(10,8) NOT NULL, -- APY as decimal
    total_value_locked DECIMAL(20,8) NOT NULL, -- USD value
    available_for_funding DECIMAL(20,8) NOT NULL, -- USD value available for card funding
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    contract_address TEXT NOT NULL, -- Smart contract address
    position_data JSONB, -- Protocol-specific position data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Multi-chain bridge transactions table
CREATE TABLE multi_chain_bridges (
    bridge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_context_hash TEXT NOT NULL,
    from_chain TEXT NOT NULL CHECK (from_chain IN ('ETH', 'POLYGON', 'ARBITRUM')),
    to_chain TEXT NOT NULL CHECK (to_chain IN ('ETH', 'POLYGON', 'ARBITRUM')),
    from_asset TEXT NOT NULL, -- Asset symbol on source chain
    to_asset TEXT NOT NULL, -- Asset symbol on destination chain
    bridge_provider TEXT NOT NULL CHECK (bridge_provider IN ('Polygon_Bridge', 'Arbitrum_Bridge', 'Multichain')),
    amount DECIMAL(20,8) NOT NULL, -- Amount being bridged
    estimated_time INTEGER NOT NULL, -- Minutes
    bridge_fee DECIMAL(20,8) NOT NULL, -- Fee in USD
    gas_estimate DECIMAL(20,8) NOT NULL, -- Gas cost estimate
    status TEXT NOT NULL CHECK (status IN ('pending', 'bridging', 'completed', 'failed')),
    transaction_hash TEXT NOT NULL, -- Source chain tx hash
    bridge_transaction_hash TEXT, -- Bridge tx hash
    funding_context_hash TEXT, -- Links to card funding without FK
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- DeFi yield optimization tracking
CREATE TABLE defi_yield_optimization (
    optimization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_context_hash TEXT NOT NULL,
    optimization_type TEXT NOT NULL CHECK (optimization_type IN ('yield_comparison', 'gas_optimization', 'rebalance_suggestion')),
    source_protocol TEXT NOT NULL,
    source_network TEXT NOT NULL CHECK (source_network IN ('ETH', 'POLYGON', 'ARBITRUM')),
    suggested_protocol TEXT,
    suggested_network TEXT CHECK (suggested_network IN ('ETH', 'POLYGON', 'ARBITRUM')),
    yield_improvement DECIMAL(10,8), -- Expected yield improvement in %
    gas_savings DECIMAL(20,8), -- Gas savings in USD
    risk_assessment TEXT NOT NULL CHECK (risk_assessment IN ('lower', 'same', 'higher')),
    recommendation_data JSONB NOT NULL, -- Detailed recommendation data
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE
);

-- Transaction batching for gas optimization
CREATE TABLE transaction_batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_context_hash TEXT NOT NULL,
    transaction_ids TEXT[] NOT NULL, -- Array of transaction IDs to batch
    batch_type TEXT NOT NULL CHECK (batch_type IN ('defi_funding', 'multi_card_funding', 'yield_optimization')),
    total_gas_optimization DECIMAL(20,8) NOT NULL, -- Gas savings in USD
    estimated_gas_cost DECIMAL(20,8) NOT NULL, -- Total estimated gas cost
    batch_status TEXT NOT NULL CHECK (batch_status IN ('pending', 'executing', 'completed', 'failed')),
    execution_strategy JSONB, -- Batching strategy details
    estimated_completion TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- DeFi protocol risk monitoring
CREATE TABLE defi_protocol_risks (
    risk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol_name TEXT NOT NULL,
    network_type TEXT NOT NULL CHECK (network_type IN ('ETH', 'POLYGON', 'ARBITRUM')),
    risk_type TEXT NOT NULL CHECK (risk_type IN ('smart_contract', 'liquidity', 'impermanent_loss', 'governance', 'oracle')),
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    risk_description TEXT NOT NULL,
    mitigation_measures JSONB, -- Risk mitigation strategies
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'monitoring', 'resolved'))
);

-- Indexes for performance optimization
CREATE INDEX idx_defi_positions_user_context ON defi_positions(user_context_hash);
CREATE INDEX idx_defi_positions_protocol_network ON defi_positions(protocol_name, network_type);
CREATE INDEX idx_defi_positions_last_updated ON defi_positions(last_updated);

CREATE INDEX idx_multi_chain_bridges_user_context ON multi_chain_bridges(user_context_hash);
CREATE INDEX idx_multi_chain_bridges_status ON multi_chain_bridges(status);
CREATE INDEX idx_multi_chain_bridges_funding_context ON multi_chain_bridges(funding_context_hash);

CREATE INDEX idx_defi_yield_optimization_user_context ON defi_yield_optimization(user_context_hash);
CREATE INDEX idx_defi_yield_optimization_expires ON defi_yield_optimization(expires_at);
CREATE INDEX idx_defi_yield_optimization_status ON defi_yield_optimization(status);

CREATE INDEX idx_transaction_batches_user_context ON transaction_batches(user_context_hash);
CREATE INDEX idx_transaction_batches_status ON transaction_batches(batch_status);
CREATE INDEX idx_transaction_batches_estimated_completion ON transaction_batches(estimated_completion);

CREATE INDEX idx_defi_protocol_risks_protocol ON defi_protocol_risks(protocol_name, network_type);
CREATE INDEX idx_defi_protocol_risks_level ON defi_protocol_risks(risk_level);
CREATE INDEX idx_defi_protocol_risks_status ON defi_protocol_risks(status);

-- Row Level Security for data isolation
ALTER TABLE defi_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_chain_bridges ENABLE ROW LEVEL SECURITY;
ALTER TABLE defi_yield_optimization ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE defi_protocol_risks ENABLE ROW LEVEL SECURITY;

-- RLS policies prevent cross-context data access
CREATE POLICY defi_positions_isolation ON defi_positions
    FOR ALL
    USING (user_context_hash = current_setting('app.user_context', true));

CREATE POLICY multi_chain_bridges_isolation ON multi_chain_bridges
    FOR ALL
    USING (user_context_hash = current_setting('app.user_context', true));

CREATE POLICY defi_yield_optimization_isolation ON defi_yield_optimization
    FOR ALL
    USING (user_context_hash = current_setting('app.user_context', true));

CREATE POLICY transaction_batches_isolation ON transaction_batches
    FOR ALL
    USING (user_context_hash = current_setting('app.user_context', true));

-- DeFi protocol risks are global but read-only for users
CREATE POLICY defi_protocol_risks_read ON defi_protocol_risks
    FOR SELECT
    USING (true); -- All users can read risk data

-- Data retention policies for DeFi position tracking
-- Automated cleanup of expired optimization suggestions
CREATE OR REPLACE FUNCTION cleanup_expired_optimizations()
RETURNS void AS $$
BEGIN
    DELETE FROM defi_yield_optimization 
    WHERE status = 'expired' 
    AND expires_at < NOW() - INTERVAL '30 days';
    
    DELETE FROM transaction_batches 
    WHERE batch_status IN ('completed', 'failed') 
    AND completed_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup function (requires pg_cron extension in production)
-- SELECT cron.schedule('cleanup-defi-data', '0 2 * * *', 'SELECT cleanup_expired_optimizations();');

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON defi_positions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON multi_chain_bridges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON defi_yield_optimization TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON transaction_batches TO authenticated;
GRANT SELECT ON defi_protocol_risks TO authenticated;

-- Insert initial protocol risk data
INSERT INTO defi_protocol_risks (protocol_name, network_type, risk_type, risk_level, risk_description, mitigation_measures) VALUES
('Aave', 'ETH', 'smart_contract', 'low', 'Audited smart contracts with established security record', '{"audits": ["Trail of Bits", "Consensys"], "bug_bounty": true}'),
('Aave', 'POLYGON', 'smart_contract', 'low', 'Same contracts deployed on Polygon with additional bridge risk', '{"audits": ["Trail of Bits", "Consensys"], "bridge_monitoring": true}'),
('Aave', 'ARBITRUM', 'smart_contract', 'low', 'L2 deployment with sequencer risk considerations', '{"audits": ["Trail of Bits", "Consensys"], "sequencer_monitoring": true}'),
('Compound', 'ETH', 'smart_contract', 'low', 'Well-established protocol with extensive audit history', '{"audits": ["OpenZeppelin", "Trail of Bits"], "governance_timelock": true}'),
('Uniswap', 'ETH', 'smart_contract', 'low', 'Core protocol audited, V3 complexity increases risk slightly', '{"audits": ["Abacus", "ABDK"], "extensive_testing": true}'),
('Uniswap', 'POLYGON', 'liquidity', 'medium', 'Lower liquidity on L2 may cause higher slippage', '{"slippage_monitoring": true, "minimum_liquidity_checks": true}'),
('Uniswap', 'ARBITRUM', 'liquidity', 'medium', 'Lower liquidity on L2 may cause higher slippage', '{"slippage_monitoring": true, "minimum_liquidity_checks": true}');