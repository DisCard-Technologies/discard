import { supabase } from '../../app';

export interface PrivacyPolicy {
  id: string;
  version: string;
  title: string;
  content: string;
  effectiveDate: string;
  isActive: boolean;
}

export interface PrivacyConsent {
  id: string;
  userId: string;
  policyVersion: string;
  consentedAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export class PrivacyService {
  /**
   * Get the current active privacy policy
   */
  async getCurrentPolicy(): Promise<PrivacyPolicy | null> {
    try {
      const { data: policy, error } = await supabase
        .from('privacy_policies')
        .select('*')
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single();

      if (error || !policy) {
        return null;
      }

      return {
        id: policy.id,
        version: policy.version,
        title: policy.title,
        content: policy.content,
        effectiveDate: policy.effective_date,
        isActive: policy.is_active
      };
    } catch (error) {
      console.error('Error fetching privacy policy:', error);
      return null;
    }
  }

  /**
   * Record user consent to privacy policy
   */
  async recordConsent(
    userId: string, 
    policyVersion: string, 
    ipAddress?: string, 
    userAgent?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Check if user has already consented to this version
      const { data: existingConsent } = await supabase
        .from('privacy_consents')
        .select('id')
        .eq('user_id', userId)
        .eq('policy_version', policyVersion)
        .single();

      if (existingConsent) {
        return { success: true, message: 'Consent already recorded for this policy version' };
      }

      // Record new consent
      const { error } = await supabase
        .from('privacy_consents')
        .insert([{
          user_id: userId,
          policy_version: policyVersion,
          ip_address: ipAddress,
          user_agent: userAgent,
          consented_at: new Date().toISOString()
        }]);

      if (error) {
        console.error('Error recording privacy consent:', error);
        return { success: false, message: 'Failed to record consent' };
      }

      return { success: true, message: 'Privacy policy consent recorded successfully' };
    } catch (error) {
      console.error('Error recording privacy consent:', error);
      return { success: false, message: 'Failed to record consent' };
    }
  }

  /**
   * Check if user has consented to current privacy policy
   */
  async hasUserConsented(userId: string): Promise<boolean> {
    try {
      const currentPolicy = await this.getCurrentPolicy();
      if (!currentPolicy) {
        return false; // No active policy
      }

      const { data: consent, error } = await supabase
        .from('privacy_consents')
        .select('id')
        .eq('user_id', userId)
        .eq('policy_version', currentPolicy.version)
        .single();

      return !error && !!consent;
    } catch (error) {
      console.error('Error checking user consent:', error);
      return false;
    }
  }

  /**
   * Get user's consent history
   */
  async getUserConsentHistory(userId: string): Promise<PrivacyConsent[]> {
    try {
      const { data: consents, error } = await supabase
        .from('privacy_consents')
        .select('*')
        .eq('user_id', userId)
        .order('consented_at', { ascending: false });

      if (error || !consents) {
        return [];
      }

      return consents.map(consent => ({
        id: consent.id,
        userId: consent.user_id,
        policyVersion: consent.policy_version,
        consentedAt: consent.consented_at,
        ipAddress: consent.ip_address,
        userAgent: consent.user_agent
      }));
    } catch (error) {
      console.error('Error fetching consent history:', error);
      return [];
    }
  }

  /**
   * Update user privacy settings
   */
  async updatePrivacySettings(
    userId: string, 
    settings: { dataRetention?: number; analyticsOptOut?: boolean }
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get current privacy settings
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('privacy_settings')
        .eq('id', userId)
        .single();

      if (fetchError || !user) {
        return { success: false, message: 'User not found' };
      }

      // Merge with existing settings
      const currentSettings = user.privacy_settings || { dataRetention: 365, analyticsOptOut: false };
      const updatedSettings = { ...currentSettings, ...settings };

      // Update privacy settings
      const { error: updateError } = await supabase
        .from('users')
        .update({ privacy_settings: updatedSettings })
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating privacy settings:', updateError);
        return { success: false, message: 'Failed to update privacy settings' };
      }

      return { success: true, message: 'Privacy settings updated successfully' };
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      return { success: false, message: 'Failed to update privacy settings' };
    }
  }

  /**
   * Get user privacy settings
   */
  async getPrivacySettings(userId: string): Promise<{ dataRetention: number; analyticsOptOut: boolean } | null> {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('privacy_settings')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return null;
      }

      return user.privacy_settings || { dataRetention: 365, analyticsOptOut: false };
    } catch (error) {
      console.error('Error fetching privacy settings:', error);
      return null;
    }
  }

  /**
   * Initialize privacy settings for new user
   */
  async initializePrivacySettings(userId: string): Promise<void> {
    try {
      const defaultSettings = {
        dataRetention: 365, // 1 year default
        analyticsOptOut: false
      };

      await supabase
        .from('users')
        .update({ privacy_settings: defaultSettings })
        .eq('id', userId);
    } catch (error) {
      console.error('Error initializing privacy settings:', error);
    }
  }
}

export const privacyService = new PrivacyService();