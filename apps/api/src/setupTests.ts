// API Test Setup
import { config } from 'dotenv';

// Load environment variables for testing
config({ path: '.env.test' });

// Set test environment variables
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = 'test';
}
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-key';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';
process.env.CARD_ENCRYPTION_KEY = process.env.CARD_ENCRYPTION_KEY || 'test-card-encryption-key';
process.env.DELETION_SIGNING_KEY = process.env.DELETION_SIGNING_KEY || 'test-deletion-signing-key';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_fake_stripe_key';
process.env.MARQETA_APPLICATION_TOKEN = process.env.MARQETA_APPLICATION_TOKEN || 'test-app-token';
process.env.MARQETA_ACCESS_TOKEN = process.env.MARQETA_ACCESS_TOKEN || 'test-access-token';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

// Increase timeout for integration tests
jest.setTimeout(30000);