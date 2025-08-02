-- Migration 004: Privacy Policy Tracking
-- Adds tables for privacy policies and user consent tracking

-- Create privacy policies table
CREATE TABLE IF NOT EXISTS privacy_policies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    version VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    effective_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create privacy consents table to track user acceptance
CREATE TABLE IF NOT EXISTS privacy_consents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    policy_version VARCHAR(20) NOT NULL,
    consented_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, policy_version)
);

-- Create indexes for privacy tables
CREATE INDEX IF NOT EXISTS idx_privacy_policies_version ON privacy_policies(version);
CREATE INDEX IF NOT EXISTS idx_privacy_policies_is_active ON privacy_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_privacy_policies_effective_date ON privacy_policies(effective_date);

CREATE INDEX IF NOT EXISTS idx_privacy_consents_user_id ON privacy_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_consents_policy_version ON privacy_consents(policy_version);
CREATE INDEX IF NOT EXISTS idx_privacy_consents_consented_at ON privacy_consents(consented_at);

-- Enable RLS for privacy tables
ALTER TABLE privacy_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_consents ENABLE ROW LEVEL SECURITY;

-- RLS policies for privacy policies (public read for active policies)
CREATE POLICY "Anyone can view active privacy policies" 
  ON privacy_policies FOR SELECT 
  USING (is_active = true);

CREATE POLICY "Only admins can manage privacy policies" 
  ON privacy_policies FOR ALL 
  USING (false); -- Will be updated when admin roles are implemented

-- RLS policies for privacy consents (users can only access their own)
CREATE POLICY "Users can view own privacy consents" 
  ON privacy_consents FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own privacy consents" 
  ON privacy_consents FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policies for consents to maintain audit trail

-- Insert initial privacy policy
INSERT INTO privacy_policies (
    version, 
    title, 
    content, 
    effective_date, 
    is_active
) VALUES (
    '1.0',
    'DisCard Privacy Policy',
    'Privacy Policy for DisCard Application

INTRODUCTION
DisCard ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our privacy-first cryptocurrency card service.

INFORMATION WE COLLECT
We collect only the minimum information necessary to provide our services:
- Email address (for account verification and communication)
- Encrypted transaction data (for card functionality)
- Optional username (if provided)
- Device and usage information (for security and fraud prevention)

DATA MINIMIZATION
We practice data minimization principles:
- We do not collect personal information beyond what is necessary
- We do not require phone numbers for two-factor authentication
- We offer anonymous usernames instead of real names
- We automatically delete inactive accounts based on your data retention settings

YOUR PRIVACY SETTINGS
You control your privacy:
- Data Retention: Choose how long we keep your data (90 days to 7 years)
- Analytics Opt-out: Disable usage analytics collection
- Communication Preferences: Control notification types
- Account Deletion: Request immediate account and data deletion

DATA PROTECTION
We implement industry-standard security measures:
- End-to-end encryption for sensitive data
- Secure multi-party computation for transaction processing
- Regular security audits and penetration testing
- No third-party data sharing without explicit consent

YOUR RIGHTS
You have the right to:
- Access your personal data
- Correct inaccurate information
- Delete your account and data
- Export your data in a portable format
- Withdraw consent for data processing

CONTACT US
For privacy-related questions or requests:
Email: privacy@discard.app

This policy is effective as of the date shown and may be updated periodically. You will be notified of any material changes.',
    NOW(),
    true
) ON CONFLICT (version) DO NOTHING;

-- Add privacy policy acceptance trigger to user registration
CREATE OR REPLACE FUNCTION handle_user_registration_privacy()
RETURNS TRIGGER AS $$
BEGIN
    -- Record automatic consent to current privacy policy for new users
    INSERT INTO privacy_consents (user_id, policy_version, consented_at)
    SELECT NEW.id, version, NEW.created_at
    FROM privacy_policies 
    WHERE is_active = true
    LIMIT 1;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new user registrations
CREATE TRIGGER user_registration_privacy_trigger
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION handle_user_registration_privacy();

-- Function to clean up old privacy consent records (keep for compliance)
CREATE OR REPLACE FUNCTION cleanup_old_privacy_data()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  -- This function is for future use - privacy consents should generally be kept
  -- for compliance purposes, but inactive policies can be archived
  
  -- Archive old inactive policies (older than 7 years)
  UPDATE privacy_policies 
  SET updated_at = NOW()
  WHERE is_active = false 
    AND effective_date < NOW() - INTERVAL '7 years';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger for privacy policies
CREATE TRIGGER update_privacy_policies_updated_at 
  BEFORE UPDATE ON privacy_policies
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE privacy_policies IS 'Stores different versions of privacy policies';
COMMENT ON COLUMN privacy_policies.version IS 'Semantic version of the privacy policy (e.g., 1.0, 1.1, 2.0)';
COMMENT ON COLUMN privacy_policies.is_active IS 'Whether this policy version is currently active';

COMMENT ON TABLE privacy_consents IS 'Tracks user consent to privacy policies for audit purposes';
COMMENT ON COLUMN privacy_consents.policy_version IS 'Version of the policy the user consented to';
COMMENT ON COLUMN privacy_consents.ip_address IS 'IP address when consent was given (for audit trail)';
COMMENT ON COLUMN privacy_consents.user_agent IS 'User agent when consent was given (for audit trail)';