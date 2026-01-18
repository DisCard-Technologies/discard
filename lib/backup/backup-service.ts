/**
 * Backup Service - High-Level Backup/Restore Orchestration
 *
 * Orchestrates the complete backup and restore flows:
 * 1. Encrypt mnemonic with password
 * 2. Upload to cloud storage
 * 3. Record metadata in Convex
 *
 * And for restore:
 * 1. Download from cloud storage
 * 2. Decrypt with password
 * 3. Import mnemonic to wallet
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import {
  EncryptedBackup,
  encryptMnemonicWithPassword,
  decryptMnemonicWithPassword,
  assessPasswordStrength,
  getBackupFingerprint,
  PasswordStrength,
} from './backup-encryption';

import {
  CloudProvider,
  CloudBackupResult,
  CloudRestoreResult,
  uploadBackup,
  downloadBackup,
  getDefaultProvider,
  getAvailableProviders,
  getProviderDisplayName,
} from './cloud-backup';

import {
  getMnemonicLocally,
  updateBackupStatus,
  getBackupStatus,
  BackupStatus,
  getMnemonicFingerprint,
} from '../mnemonic';

import {
  validateMnemonic,
  deriveKeypairFromMnemonic,
  MnemonicWallet,
} from '../mnemonic/bip39-wallet';

/**
 * Backup creation result
 */
export interface CreateBackupResult {
  success: boolean;
  provider: CloudProvider;
  backupId?: string;
  fingerprint?: string;
  error?: string;
}

/**
 * Backup restore result
 */
export interface RestoreBackupResult {
  success: boolean;
  provider?: CloudProvider;
  wallet?: MnemonicWallet;
  error?: string;
}

/**
 * Manual restore result (from 12-word entry)
 */
export interface ManualRestoreResult {
  success: boolean;
  wallet?: MnemonicWallet;
  error?: string;
}

/**
 * Backup info for display
 */
export interface BackupInfo {
  hasBackup: boolean;
  provider?: CloudProvider;
  lastBackupAt?: number;
  fingerprint?: string;
}

// ============================================================================
// Backup Creation
// ============================================================================

/**
 * Create an encrypted backup and upload to cloud storage
 *
 * @param password - User's backup password
 * @param provider - Cloud provider to use (defaults to platform default)
 * @param deviceName - Optional device name for metadata
 * @returns Result of backup creation
 */
export async function createBackup(
  password: string,
  provider?: CloudProvider,
  deviceName?: string
): Promise<CreateBackupResult> {
  try {
    // Validate password strength
    const strength = assessPasswordStrength(password);
    if (strength.score < 2) {
      return {
        success: false,
        provider: provider || getDefaultProvider(),
        error: 'Password is too weak. Please use a stronger password.',
      };
    }

    // Get mnemonic from local storage
    const mnemonic = await getMnemonicLocally();
    if (!mnemonic) {
      return {
        success: false,
        provider: provider || getDefaultProvider(),
        error: 'No seed phrase found. Please create a wallet first.',
      };
    }

    // Get mnemonic fingerprint
    const fingerprint = getMnemonicFingerprint(mnemonic);
    const wordCount = mnemonic.trim().split(/\s+/).length;

    // Encrypt mnemonic
    const backup = encryptMnemonicWithPassword(mnemonic, password, {
      fingerprint,
      deviceName,
      wordCount,
    });

    // Upload to cloud storage
    const targetProvider = provider || getDefaultProvider();
    const uploadResult = await uploadBackup(backup, targetProvider);

    if (!uploadResult.success) {
      return {
        success: false,
        provider: targetProvider,
        error: uploadResult.error || 'Upload failed',
      };
    }

    // Update local backup status
    await updateBackupStatus({
      hasCloudBackup: targetProvider !== 'local_file',
      hasLocalBackup: targetProvider === 'local_file',
      lastBackupAt: Date.now(),
      backupProvider: targetProvider,
    });

    return {
      success: true,
      provider: targetProvider,
      backupId: uploadResult.backupId,
      fingerprint,
    };
  } catch (error) {
    return {
      success: false,
      provider: provider || getDefaultProvider(),
      error: error instanceof Error ? error.message : 'Backup failed',
    };
  }
}

/**
 * Check password strength before backup
 *
 * @param password - Password to check
 * @returns Password strength assessment
 */
export function checkPasswordStrength(password: string): PasswordStrength {
  return assessPasswordStrength(password);
}

// ============================================================================
// Backup Restoration
// ============================================================================

/**
 * Restore wallet from cloud backup
 *
 * @param password - Backup password
 * @param provider - Cloud provider to download from
 * @returns Restored wallet or error
 */
export async function restoreFromBackup(
  password: string,
  provider?: CloudProvider
): Promise<RestoreBackupResult> {
  try {
    const targetProvider = provider || getDefaultProvider();

    // Download backup from cloud
    const downloadResult = await downloadBackup(targetProvider);

    if (!downloadResult.success || !downloadResult.backup) {
      return {
        success: false,
        provider: targetProvider,
        error: downloadResult.error || 'No backup found',
      };
    }

    // Decrypt mnemonic
    let mnemonic: string;
    try {
      mnemonic = decryptMnemonicWithPassword(downloadResult.backup, password);
    } catch (error) {
      return {
        success: false,
        provider: targetProvider,
        error: 'Invalid password',
      };
    }

    // Validate mnemonic
    const validation = validateMnemonic(mnemonic);
    if (!validation.isValid) {
      return {
        success: false,
        provider: targetProvider,
        error: 'Backup contains invalid seed phrase',
      };
    }

    // Derive keypair from mnemonic
    const wallet = deriveKeypairFromMnemonic(mnemonic);

    return {
      success: true,
      provider: targetProvider,
      wallet,
    };
  } catch (error) {
    return {
      success: false,
      provider: provider || getDefaultProvider(),
      error: error instanceof Error ? error.message : 'Restore failed',
    };
  }
}

/**
 * Restore wallet from manually entered 12-word phrase
 *
 * @param mnemonic - 12 or 24 word mnemonic phrase
 * @returns Restored wallet or error
 */
export async function restoreFromMnemonic(
  mnemonic: string
): Promise<ManualRestoreResult> {
  try {
    const normalizedMnemonic = mnemonic.trim().toLowerCase();

    // Validate mnemonic
    const validation = validateMnemonic(normalizedMnemonic);
    if (!validation.isValid) {
      if (validation.invalidWords.length > 0) {
        return {
          success: false,
          error: `Invalid words: ${validation.invalidWords.slice(0, 3).join(', ')}${validation.invalidWords.length > 3 ? '...' : ''}`,
        };
      }
      return {
        success: false,
        error: 'Invalid seed phrase. Please check and try again.',
      };
    }

    // Derive keypair from mnemonic
    const wallet = deriveKeypairFromMnemonic(normalizedMnemonic);

    return {
      success: true,
      wallet,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Restore failed',
    };
  }
}

// ============================================================================
// Backup Status
// ============================================================================

/**
 * Get current backup information
 *
 * @returns Backup info for display
 */
export async function getBackupInfo(): Promise<BackupInfo> {
  const status = await getBackupStatus();

  if (!status.hasCloudBackup && !status.hasLocalBackup) {
    return {
      hasBackup: false,
    };
  }

  return {
    hasBackup: true,
    provider: status.backupProvider,
    lastBackupAt: status.lastBackupAt,
  };
}

/**
 * Check if backup is needed (no backup exists)
 *
 * @returns true if backup is recommended
 */
export async function isBackupNeeded(): Promise<boolean> {
  const status = await getBackupStatus();
  return !status.hasCloudBackup && !status.hasLocalBackup;
}

/**
 * Get recommended backup provider for current platform
 *
 * @returns Recommended provider
 */
export function getRecommendedProvider(): CloudProvider {
  return getDefaultProvider();
}

/**
 * Get all available providers
 *
 * @returns List of available providers with display info
 */
export function getProviderOptions(): Array<{
  provider: CloudProvider;
  displayName: string;
  isRecommended: boolean;
  isAvailable: boolean;
}> {
  const availability = getAvailableProviders();
  const recommended = getDefaultProvider();

  return [
    {
      provider: 'icloud',
      displayName: 'iCloud',
      isRecommended: recommended === 'icloud',
      isAvailable: availability.icloud,
    },
    {
      provider: 'google_drive',
      displayName: 'Google Drive',
      isRecommended: recommended === 'google_drive',
      isAvailable: availability.googleDrive,
    },
    {
      provider: 'local_file',
      displayName: 'Download File',
      isRecommended: recommended === 'local_file',
      isAvailable: availability.localFile,
    },
  ];
}

// ============================================================================
// Verification
// ============================================================================

/**
 * Verify that a backup matches the current wallet
 *
 * @param backup - Encrypted backup to verify
 * @param password - Password to decrypt
 * @returns true if backup matches current wallet
 */
export async function verifyBackupMatchesWallet(
  backup: EncryptedBackup,
  password: string
): Promise<boolean> {
  try {
    // Get current mnemonic fingerprint
    const currentMnemonic = await getMnemonicLocally();
    if (!currentMnemonic) return false;

    const currentFingerprint = getMnemonicFingerprint(currentMnemonic);

    // Check backup metadata fingerprint first (fast path)
    if (backup.metadata?.fingerprint) {
      return backup.metadata.fingerprint === currentFingerprint;
    }

    // Decrypt and compare (slow path)
    const decryptedMnemonic = decryptMnemonicWithPassword(backup, password);
    const decryptedFingerprint = getMnemonicFingerprint(decryptedMnemonic);

    return decryptedFingerprint === currentFingerprint;
  } catch {
    return false;
  }
}

/**
 * Generate a hash of the backup for Convex metadata storage
 *
 * @param backup - Encrypted backup
 * @returns Hex-encoded hash
 */
export function generateBackupHash(backup: EncryptedBackup): string {
  // Hash the ciphertext (not plaintext) for identification
  const combined = backup.salt + backup.nonce + backup.ciphertext;
  const hash = sha256(new TextEncoder().encode(combined));
  return bytesToHex(hash);
}
