/**
 * Test Environment Configuration
 * Sets up environment variables for testing
 * This file is used for setup only - no tests should be defined here
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-only';
process.env.CARD_ENCRYPTION_KEY = 'test-card-encryption-key-for-testing-only';
process.env.DELETION_SIGNING_KEY = 'test-deletion-signing-key-for-testing-only';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = 'test-supabase-key';

// Export empty object to satisfy module requirements
export {};