/**
 * Test Database Setup using TestContainers
 * Provides real PostgreSQL instance for integration tests
 */

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export class TestDatabase {
  private client: Client | null = null;
  private container: StartedPostgreSqlContainer | null = null;
  private connectionString: string;
  private static instance: TestDatabase | null = null;

  constructor() {
    // Use test database connection string (fallback to manual setup)
    this.connectionString = process.env.TEST_DATABASE_URL || 
      'postgresql://test:test@localhost:5433/discard_test';
  }

  /**
   * Get singleton instance for shared test database
   */
  static getInstance(): TestDatabase {
    if (!TestDatabase.instance) {
      TestDatabase.instance = new TestDatabase();
    }
    return TestDatabase.instance;
  }

  /**
   * Start TestContainer and setup database
   */
  async setup(): Promise<void> {
    try {
      // Check if we should use TestContainers or existing database
      if (!process.env.TEST_DATABASE_URL && !process.env.CI) {
        console.log('Starting PostgreSQL TestContainer...');
        await this.startContainer();
      } else {
        console.log('Using existing test database connection...');
      }

      // Connect to database
      this.client = new Client({ connectionString: this.connectionString });
      await this.client.connect();
      console.log('Connected to test database');
      
      // Run migrations
      await this.runMigrations();
      
      // Seed test data
      await this.seedTestData();
      console.log('Test database setup complete');
      
    } catch (error) {
      console.error('Failed to setup test database:', error);
      throw error;
    }
  }

  /**
   * Start PostgreSQL container using TestContainers
   */
  private async startContainer(): Promise<void> {
    this.container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('discard_test')
      .withUsername('test')
      .withPassword('test')
      .start();

    // Update connection string to point to container
    const port = this.container.getPort();
    const host = this.container.getHost();
    this.connectionString = `postgresql://test:test@${host}:${port}/discard_test`;
    
    console.log(`PostgreSQL TestContainer started on ${host}:${port}`);
  }

  /**
   * Cleanup database connection and stop container
   */
  async cleanup(): Promise<void> {
    try {
      if (this.client) {
        // Clean all test data
        await this.client.query('TRUNCATE TABLE crypto_wallets, wallet_sessions, crypto_transactions CASCADE');
        await this.client.end();
        this.client = null;
        console.log('Database connection closed');
      }

      // Stop TestContainer if we started it
      if (this.container) {
        await this.container.stop();
        this.container = null;
        console.log('PostgreSQL TestContainer stopped');
      }
    } catch (error) {
      console.error('Error during test database cleanup:', error);
      throw error;
    }
  }

  /**
   * Stop TestContainer and reset singleton
   */
  static async teardown(): Promise<void> {
    if (TestDatabase.instance) {
      await TestDatabase.instance.cleanup();
      TestDatabase.instance = null;
    }
  }

  async runMigrations(): Promise<void> {
    if (!this.client) throw new Error('Database not connected');
    
    try {
      // Try to run existing migrations
      const migrationPath = join(__dirname, '../../../database/migrations/007_crypto_wallet_schema.sql');
      
      try {
        const migrationSQL = readFileSync(migrationPath, 'utf8');
        await this.client.query(migrationSQL);
        console.log('✅ Crypto wallet migrations applied');
      } catch (fileError) {
        console.log('Migration file not found, creating basic schema...');
        await this.createBasicSchema();
      }
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Create basic schema for testing when migration files are not available
   */
  private async createBasicSchema(): Promise<void> {
    if (!this.client) throw new Error('Database not connected');

    const schemaSQL = `
      -- Enable UUID extension
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- Users table (simplified for testing)
      CREATE TABLE IF NOT EXISTS auth_users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Crypto wallets table
      CREATE TABLE IF NOT EXISTS crypto_wallets (
        wallet_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
        wallet_type VARCHAR(50) NOT NULL,
        wallet_name VARCHAR(255) NOT NULL,
        wallet_address_encrypted TEXT NOT NULL,
        wallet_address_hash VARCHAR(64) UNIQUE NOT NULL,
        network VARCHAR(50) DEFAULT 'mainnet',
        supported_currencies TEXT[] DEFAULT '{}',
        connection_status VARCHAR(50) DEFAULT 'connected',
        wallet_metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Wallet sessions table (for WalletConnect)
      CREATE TABLE IF NOT EXISTS wallet_sessions (
        session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
        wallet_type VARCHAR(50) NOT NULL,
        session_data JSONB NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Crypto transactions table
      CREATE TABLE IF NOT EXISTS crypto_transactions (
        transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        wallet_id UUID REFERENCES crypto_wallets(wallet_id) ON DELETE CASCADE,
        transaction_hash VARCHAR(255) UNIQUE,
        from_address VARCHAR(255) NOT NULL,
        to_address VARCHAR(255) NOT NULL,
        amount DECIMAL(30, 18) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        network VARCHAR(50) NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_crypto_wallets_user_id ON crypto_wallets(user_id);
      CREATE INDEX IF NOT EXISTS idx_crypto_wallets_hash ON crypto_wallets(wallet_address_hash);
      CREATE INDEX IF NOT EXISTS idx_wallet_sessions_user_id ON wallet_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_crypto_transactions_wallet_id ON crypto_transactions(wallet_id);
    `;

    await this.client.query(schemaSQL);
    console.log('✅ Basic test schema created');
  }

  async seedTestData(): Promise<void> {
    if (!this.client) throw new Error('Database not connected');
    
    try {
      // Create test users
      await this.client.query(`
        INSERT INTO auth_users (id, email, username) 
        VALUES 
          ('11111111-1111-1111-1111-111111111111', 'test1@example.com', 'test_user_1'),
          ('22222222-2222-2222-2222-222222222222', 'test2@example.com', 'test_user_2')
        ON CONFLICT (id) DO NOTHING
      `);

      // Create test crypto wallets
      await this.client.query(`
        INSERT INTO crypto_wallets (
          wallet_id, user_id, wallet_type, wallet_name, 
          wallet_address_encrypted, wallet_address_hash, network, supported_currencies
        ) VALUES 
          (
            '33333333-3333-3333-3333-333333333333',
            '11111111-1111-1111-1111-111111111111',
            'metamask',
            'Test MetaMask Wallet',
            'encrypted-eth-address-data',
            'hash-eth-address-123',
            'mainnet',
            ARRAY['ETH', 'USDT', 'USDC']
          ),
          (
            '44444444-4444-4444-4444-444444444444',
            '11111111-1111-1111-1111-111111111111',
            'bitcoin',
            'Test Bitcoin Wallet',
            'encrypted-btc-address-data',
            'hash-btc-address-456',
            'mainnet',
            ARRAY['BTC']
          )
        ON CONFLICT (wallet_id) DO NOTHING
      `);

      // Create test transactions
      await this.client.query(`
        INSERT INTO crypto_transactions (
          transaction_id, wallet_id, transaction_hash, from_address, to_address,
          amount, currency, network, transaction_type, status
        ) VALUES 
          (
            '55555555-5555-5555-5555-555555555555',
            '33333333-3333-3333-3333-333333333333',
            '0xtest123456789abcdef',
            '0xfrom123456789abcdef',
            '0xto123456789abcdef',
            1.5,
            'ETH',
            'mainnet',
            'send',
            'confirmed'
          )
        ON CONFLICT (transaction_id) DO NOTHING
      `);

      console.log('✅ Test data seeded');
    } catch (error) {
      console.error('Failed to seed test data:', error);
      throw error;
    }
  }

  /**
   * Reset database to clean state
   */
  async reset(): Promise<void> {
    if (!this.client) throw new Error('Database not connected');
    
    // Clean all data
    await this.client.query('TRUNCATE TABLE crypto_transactions, wallet_sessions, crypto_wallets, auth_users CASCADE');
    
    // Re-seed test data
    await this.seedTestData();
    console.log('✅ Database reset to clean state');
  }

  getClient(): Client {
    if (!this.client) throw new Error('Database not connected');
    return this.client;
  }
}