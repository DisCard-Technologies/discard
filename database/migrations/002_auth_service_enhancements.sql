-- Migration 002: Auth Service Enhancements
-- Updates users table and adds verification tokens for auth service

-- Update users table to match auth service requirements
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{"dataRetention": 365, "analyticsOptOut": false}',
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

-- Make username optional (remove NOT NULL constraint)
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;

-- Rename is_verified to email_verified for clarity if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_verified') THEN
    -- Update existing records to use new column
    UPDATE users SET email_verified = is_verified WHERE is_verified IS NOT NULL;
    -- Drop old column
    ALTER TABLE users DROP COLUMN is_verified;
  END IF;
END $$;

-- Create user verification tokens table for email verification and password reset
CREATE TABLE IF NOT EXISTS user_verification_tokens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('email_verification', 'password_reset')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for verification tokens
CREATE INDEX IF NOT EXISTS idx_verification_tokens_user_id ON user_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON user_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_type ON user_verification_tokens(type);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_expires_at ON user_verification_tokens(expires_at);

-- Create indexes for new user fields
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);
CREATE INDEX IF NOT EXISTS idx_users_failed_login_attempts ON users(failed_login_attempts);

-- Enable RLS for verification tokens
ALTER TABLE user_verification_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies for verification tokens (users can only access their own tokens)
CREATE POLICY "Users can view own verification tokens" 
  ON user_verification_tokens FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own verification tokens" 
  ON user_verification_tokens FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own verification tokens" 
  ON user_verification_tokens FOR DELETE 
  USING (auth.uid() = user_id);

-- Function to clean up expired tokens (run this periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_verification_tokens 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update last_active on user updates
CREATE OR REPLACE FUNCTION update_last_active()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_active = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_last_active 
  BEFORE UPDATE ON users
  FOR EACH ROW 
  EXECUTE FUNCTION update_last_active();

-- Update existing users to have email_verified = true if they already exist
-- (for backward compatibility)
UPDATE users SET email_verified = TRUE WHERE email_verified IS NULL;

-- Comments for documentation
COMMENT ON TABLE user_verification_tokens IS 'Stores temporary tokens for email verification and password reset';
COMMENT ON COLUMN users.email_verified IS 'Whether the user has verified their email address';
COMMENT ON COLUMN users.last_active IS 'Last time the user was active (login or API call)';
COMMENT ON COLUMN users.privacy_settings IS 'JSON object containing user privacy preferences';
COMMENT ON COLUMN users.failed_login_attempts IS 'Number of consecutive failed login attempts';
COMMENT ON COLUMN users.locked_until IS 'Account lock expiration timestamp after failed attempts';