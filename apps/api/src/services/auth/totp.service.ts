import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { supabase } from '../../app';
import { AUTH_CONSTANTS } from '../../constants/auth.constants';

export interface TOTPSetupData {
  secret: string;
  manualEntryKey: string;
  qrCodeUrl: string;
  qrCodeDataUrl: string;
}

export class TOTPService {
  /**
   * Generate TOTP secret and QR code for user setup
   */
  async setupTOTP(userId: string, userEmail: string): Promise<TOTPSetupData> {
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${AUTH_CONSTANTS.TOTP.ISSUER} (${userEmail})`,
      issuer: AUTH_CONSTANTS.TOTP.ISSUER,
      length: AUTH_CONSTANTS.TOTP.SECRET_LENGTH
    });

    // Store temporary secret in database (not activated until verified)
    await supabase
      .from('user_totp_secrets')
      .upsert([{
        user_id: userId,
        secret: secret.base32,
        is_active: false,
        created_at: new Date().toISOString()
      }], {
        onConflict: 'user_id'
      });

    // Generate QR code data URL
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url || '');

    return {
      secret: secret.base32,
      manualEntryKey: secret.base32,
      qrCodeUrl: secret.otpauth_url || '',
      qrCodeDataUrl
    };
  }

  /**
   * Verify TOTP token and activate 2FA for user
   */
  async verifyAndActivateTOTP(userId: string, token: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get user's temporary secret
      const { data: totpRecord, error } = await supabase
        .from('user_totp_secrets')
        .select('secret, is_active')
        .eq('user_id', userId)
        .single();

      if (error || !totpRecord) {
        return { success: false, message: 'TOTP setup not found. Please start setup again.' };
      }

      if (totpRecord.is_active) {
        return { success: false, message: '2FA is already active for this account.' };
      }

      // Verify the token
      const verified = speakeasy.totp.verify({
        secret: totpRecord.secret,
        encoding: 'base32',
        token,
        window: AUTH_CONSTANTS.TOTP.WINDOW // Allow some time drift
      });

      if (!verified) {
        return { success: false, message: 'Invalid verification code. Please try again.' };
      }

      // Activate 2FA
      await supabase
        .from('user_totp_secrets')
        .update({ 
          is_active: true,
          activated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      // Update user record to indicate 2FA is enabled
      await supabase
        .from('users')
        .update({ totp_enabled: true })
        .eq('id', userId);

      return { success: true, message: AUTH_CONSTANTS.SUCCESS.TOTP_ACTIVATED };
    } catch (error) {
      console.error('TOTP activation error:', error);
      return { success: false, message: 'Failed to activate 2FA. Please try again.' };
    }
  }

  /**
   * Verify TOTP token for login
   */
  async verifyTOTP(userId: string, token: string): Promise<boolean> {
    try {
      // Get user's active secret
      const { data: totpRecord, error } = await supabase
        .from('user_totp_secrets')
        .select('secret, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (error || !totpRecord) {
        return false;
      }

      // Verify the token
      return speakeasy.totp.verify({
        secret: totpRecord.secret,
        encoding: 'base32',
        token,
        window: AUTH_CONSTANTS.TOTP.WINDOW // Allow some time drift
      });
    } catch (error) {
      console.error('TOTP verification error:', error);
      return false;
    }
  }

  /**
   * Check if user has 2FA enabled
   */
  async isTOTPEnabled(userId: string): Promise<boolean> {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('totp_enabled')
        .eq('id', userId)
        .single();

      return !error && user?.totp_enabled === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Disable 2FA for user (requires current password verification)
   */
  async disableTOTP(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Deactivate TOTP secret
      await supabase
        .from('user_totp_secrets')
        .update({ 
          is_active: false,
          disabled_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      // Update user record
      await supabase
        .from('users')
        .update({ totp_enabled: false })
        .eq('id', userId);

      return { success: true, message: AUTH_CONSTANTS.SUCCESS.TOTP_DISABLED };
    } catch (error) {
      console.error('TOTP disable error:', error);
      return { success: false, message: 'Failed to disable 2FA. Please try again.' };
    }
  }

  /**
   * Generate backup codes for 2FA recovery
   */
  async generateBackupCodes(userId: string): Promise<string[]> {
    const backupCodes: string[] = [];
    
    // Generate backup codes
    for (let i = 0; i < AUTH_CONSTANTS.TOTP.BACKUP_CODES_COUNT; i++) {
      const code = Math.random().toString(36).substring(2, 2 + AUTH_CONSTANTS.TOTP.BACKUP_CODE_LENGTH).toUpperCase();
      backupCodes.push(code);
    }

    // Store backup codes in database (hashed)
    const hashedCodes = await Promise.all(
      backupCodes.map(async (code) => {
        const bcrypt = await import('bcryptjs');
        return bcrypt.hash(code, 10);
      })
    );

    await supabase
      .from('user_backup_codes')
      .delete()
      .eq('user_id', userId); // Remove old codes

    await supabase
      .from('user_backup_codes')
      .insert(
        hashedCodes.map((hashedCode) => ({
          user_id: userId,
          code_hash: hashedCode,
          is_used: false,
          created_at: new Date().toISOString()
        }))
      );

    return backupCodes;
  }

  /**
   * Verify backup code for 2FA recovery
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    try {
      const { data: backupCodes, error } = await supabase
        .from('user_backup_codes')
        .select('id, code_hash')
        .eq('user_id', userId)
        .eq('is_used', false);

      if (error || !backupCodes || backupCodes.length === 0) {
        return false;
      }

      const bcrypt = await import('bcryptjs');
      
      for (const backupCode of backupCodes) {
        const isValid = await bcrypt.compare(code, backupCode.code_hash);
        if (isValid) {
          // Mark backup code as used
          await supabase
            .from('user_backup_codes')
            .update({ 
              is_used: true,
              used_at: new Date().toISOString()
            })
            .eq('id', backupCode.id);

          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Backup code verification error:', error);
      return false;
    }
  }
}

export const totpService = new TOTPService();