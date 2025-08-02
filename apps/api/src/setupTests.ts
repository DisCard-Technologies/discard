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
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';
process.env.CARD_ENCRYPTION_KEY = process.env.CARD_ENCRYPTION_KEY || 'test-card-encryption-key';
process.env.DELETION_SIGNING_KEY = process.env.DELETION_SIGNING_KEY || 'test-deletion-signing-key';

// Increase timeout for integration tests
jest.setTimeout(30000);