-- Development Seed Data
-- This file contains test data for development and testing

BEGIN;

-- Test users (using bcrypt hashed passwords for 'password123')
INSERT INTO users (id, email, username, password_hash, is_verified, kyc_status) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'john.doe@example.com', 'johndoe', '$2b$10$rXp.Zz3fGF5pOHs7gDUEHOw6Rl0xOz4Jz8Lz5DzN8pqYm4Ct.WmJO', true, 'approved'),
    ('550e8400-e29b-41d4-a716-446655440002', 'alice.smith@example.com', 'alicesmith', '$2b$10$rXp.Zz3fGF5pOHs7gDUEHOw6Rl0xOz4Jz8Lz5DzN8pqYm4Ct.WmJO', true, 'approved'),
    ('550e8400-e29b-41d4-a716-446655440003', 'bob.wilson@example.com', 'bobwilson', '$2b$10$rXp.Zz3fGF5pOHs7gDUEHOw6Rl0xOz4Jz8Lz5DzN8pqYm4Ct.WmJO', false, 'pending'),
    ('550e8400-e29b-41d4-a716-446655440004', 'test.user@example.com', 'testuser', '$2b$10$rXp.Zz3fGF5pOHs7gDUEHOw6Rl0xOz4Jz8Lz5DzN8pqYm4Ct.WmJO', true, 'approved');

-- Test cards
INSERT INTO cards (id, user_id, card_number_encrypted, card_type, status, balance_usd, spending_limit_daily, spending_limit_monthly, expires_at) VALUES
    ('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440001', 'encrypted_card_number_1', 'virtual', 'active', 500.00, 1000.00, 5000.00, '2025-12-31 23:59:59'),
    ('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440002', 'encrypted_card_number_2', 'virtual', 'active', 1200.50, 2000.00, 10000.00, '2025-12-31 23:59:59'),
    ('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440001', 'encrypted_card_number_3', 'physical', 'frozen', 0.00, 500.00, 3000.00, '2025-12-31 23:59:59'),
    ('550e8400-e29b-41d4-a716-446655440104', '550e8400-e29b-41d4-a716-446655440004', 'encrypted_card_number_4', 'virtual', 'active', 750.25, 1500.00, 7500.00, '2025-12-31 23:59:59');

-- Test funding sources
INSERT INTO funding_sources (id, user_id, source_type, source_identifier, is_verified, is_active) VALUES
    ('550e8400-e29b-41d4-a716-446655440201', '550e8400-e29b-41d4-a716-446655440001', 'crypto_wallet', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', true, true),
    ('550e8400-e29b-41d4-a716-446655440202', '550e8400-e29b-41d4-a716-446655440002', 'crypto_wallet', '0x742d35Cc6634C0532925a3b8D82F7E7b5E3C0b0C', true, true),
    ('550e8400-e29b-41d4-a716-446655440203', '550e8400-e29b-41d4-a716-446655440001', 'crypto_exchange', 'coinbase_pro_account_1', true, true),
    ('550e8400-e29b-41d4-a716-446655440204', '550e8400-e29b-41d4-a716-446655440004', 'crypto_wallet', '0x8ba1f109551bD432803012645Hac136c4c3E8b5f', false, true);

-- Test transactions
INSERT INTO transactions (id, user_id, card_id, amount_usd, currency, merchant_name, merchant_category, transaction_type, status, metadata) VALUES
    ('550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440101', 29.99, 'USD', 'Amazon', 'Online Retail', 'purchase', 'completed', '{"order_id": "AMZ-123456", "shipping": "prime"}'),
    ('550e8400-e29b-41d4-a716-446655440302', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440102', 150.00, 'USD', 'Uber', 'Transportation', 'purchase', 'completed', '{"trip_id": "UBR-789012", "route": "Airport to Hotel"}'),
    ('550e8400-e29b-41d4-a716-446655440303', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440101', 5.99, 'USD', 'Netflix', 'Entertainment', 'purchase', 'completed', '{"subscription": "monthly", "plan": "basic"}'),
    ('550e8400-e29b-41d4-a716-446655440304', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440104', 89.50, 'USD', 'Steam', 'Gaming', 'purchase', 'pending', '{"game": "Cyberpunk 2077", "platform": "PC"}'),
    ('550e8400-e29b-41d4-a716-446655440305', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440102', 2.50, 'USD', 'DisCard', 'Fees', 'fee', 'completed', '{"fee_type": "monthly_maintenance"}');

-- Test card funding (crypto-to-USD conversions)
INSERT INTO card_funding (id, card_id, funding_source_id, amount_usd, crypto_currency, crypto_amount, exchange_rate, status, completed_at) VALUES
    ('550e8400-e29b-41d4-a716-446655440401', '550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440201', 500.00, 'BTC', 0.01234567, 40520.50, 'completed', NOW() - INTERVAL '2 days'),
    ('550e8400-e29b-41d4-a716-446655440402', '550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440202', 1000.00, 'ETH', 0.62500000, 1600.00, 'completed', NOW() - INTERVAL '1 day'),
    ('550e8400-e29b-41d4-a716-446655440403', '550e8400-e29b-41d4-a716-446655440104', '550e8400-e29b-41d4-a716-446655440204', 750.00, 'USDC', 750.00000000, 1.00, 'completed', NOW() - INTERVAL '3 hours'),
    ('550e8400-e29b-41d4-a716-446655440404', '550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440202', 200.00, 'ETH', 0.12500000, 1600.00, 'pending', NULL);

COMMIT;