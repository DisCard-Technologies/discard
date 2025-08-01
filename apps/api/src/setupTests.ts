// API Test Setup
import { config } from 'dotenv';

// Load environment variables for testing
config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

// Increase timeout for integration tests
jest.setTimeout(30000);