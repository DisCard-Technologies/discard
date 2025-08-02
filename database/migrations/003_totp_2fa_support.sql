-- Migration 003: TOTP 2FA Support
-- Adds tables and fields for two-factor authentication

-- Add TOTP enabled flag to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;

-- Create user TOTP secrets table
CREATE TABLE IF NOT EXISTS user_totp_secrets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    secret TEXT NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    disabled_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id)
);

-- Create user backup codes table for 2FA recovery
CREATE TABLE IF NOT EXISTS user_backup_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for TOTP tables
CREATE INDEX IF NOT EXISTS idx_totp_secrets_user_id ON user_totp_secrets(user_id);
CREATE INDEX IF NOT EXISTS idx_totp_secrets_is_active ON user_totp_secrets(is_active);
CREATE INDEX IF NOT EXISTS idx_backup_codes_user_id ON user_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_backup_codes_is_used ON user_backup_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_users_totp_enabled ON users(totp_enabled);

-- Enable RLS for TOTP tables
ALTER TABLE user_totp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_backup_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies for TOTP secrets (users can only access their own)
CREATE POLICY "Users can view own TOTP secrets" 
  ON user_totp_secrets FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own TOTP secrets" 
  ON user_totp_secrets FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own TOTP secrets" 
  ON user_totp_secrets FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own TOTP secrets" 
  ON user_totp_secrets FOR DELETE 
  USING (auth.uid() = user_id);

-- RLS policies for backup codes (users can only access their own)
CREATE POLICY "Users can view own backup codes" 
  ON user_backup_codes FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own backup codes" 
  ON user_backup_codes FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own backup codes" 
  ON user_backup_codes FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own backup codes" 
  ON user_backup_codes FOR DELETE 
  USING (auth.uid() = user_id);

-- Function to clean up unused TOTP secrets older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_inactive_totp_secrets()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_totp_secrets 
  WHERE is_active = false 
    AND created_at < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up used backup codes older than 30 days
CREATE OR REPLACE FUNCTION cleanup_used_backup_codes()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_backup_codes 
  WHERE is_used = true 
    AND used_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE user_totp_secrets IS 'Stores TOTP secrets for two-factor authentication';
COMMENT ON COLUMN user_totp_secrets.secret IS 'Base32 encoded TOTP secret';
COMMENT ON COLUMN user_totp_secrets.is_active IS 'Whether this TOTP secret is currently active';

COMMENT ON TABLE user_backup_codes IS 'Stores hashed backup codes for 2FA recovery';
COMMENT ON COLUMN user_backup_codes.code_hash IS 'Hashed backup code for recovery';
COMMENT ON COLUMN user_backup_codes.is_used IS 'Whether this backup code has been used';

COMMENT ON COLUMN users.totp_enabled IS 'Whether the user has two-factor authentication enabled';