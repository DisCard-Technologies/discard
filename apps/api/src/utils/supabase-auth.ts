import { supabase } from '../app';

/**
 * Set JWT context for Supabase RLS policies when using custom authentication
 * This allows auth.uid() to work with our custom JWT tokens
 */
export async function setSupabaseJWTContext(userId: string): Promise<void> {
  try {
    // Set the JWT claims in the database session
    // This makes auth.uid() return the userId for RLS policies
    const { error } = await supabase.rpc('set_config', {
      setting_name: 'request.jwt.claims',
      setting_value: JSON.stringify({ sub: userId }),
      is_local: true
    });

    if (error) {
      console.error('Failed to set JWT context for RLS:', error);
      throw new Error('Authentication context setup failed');
    }
  } catch (error) {
    console.error('Error setting Supabase JWT context:', error);
    throw error;
  }
}

/**
 * Clear JWT context (optional cleanup)
 */
export async function clearSupabaseJWTContext(): Promise<void> {
  try {
    const { error } = await supabase.rpc('set_config', {
      setting_name: 'request.jwt.claims',
      setting_value: null,
      is_local: true
    });

    if (error) {
      console.error('Failed to clear JWT context:', error);
    }
  } catch (error) {
    console.error('Error clearing Supabase JWT context:', error);
  }
}

/**
 * Execute a function with proper JWT context for RLS
 */
export async function withSupabaseAuth<T>(
  userId: string, 
  operation: () => Promise<T>
): Promise<T> {
  await setSupabaseJWTContext(userId);
  
  try {
    return await operation();
  } finally {
    // Optionally clear context after operation
    // await clearSupabaseJWTContext();
  }
}