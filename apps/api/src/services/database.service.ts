import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Logger } from '../utils/logger';

export class DatabaseService {
  private client: SupabaseClient;
  private logger: Logger;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    this.logger = new Logger('DatabaseService');
  }

  /**
   * Get Supabase client instance
   */
  getClient(): SupabaseClient {
    return this.client;
  }

  /**
   * Execute a raw SQL query
   */
  async query(sql: string, params?: any[]): Promise<any> {
    try {
      const { data, error } = await this.client.rpc('execute_sql', {
        sql_query: sql,
        params: params || []
      });

      if (error) {
        this.logger.error('Database query error', error);
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('Database query execution failed', error);
      throw error;
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('pg_stat_activity')
        .select('datname')
        .limit(1);

      return !error;
    } catch (error) {
      this.logger.error('Database connection test failed', error);
      return false;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    // Supabase client doesn't require explicit closing
    this.logger.info('Database service closed');
  }
}