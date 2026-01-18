/**
 * Backup Module
 *
 * Encrypted cloud backup for seed phrases
 */

export {
  // Backup Encryption
  encryptMnemonicWithPassword,
  decryptMnemonicWithPassword,
  verifyBackupPassword,
  assessPasswordStrength,
  serializeBackup,
  parseBackup,
  getBackupFingerprint,
  createBackupFilename,
  type EncryptedBackup,
  type PasswordStrength,
} from './backup-encryption';

export {
  // Cloud Backup
  uploadBackup,
  downloadBackup,
  hasCloudBackup,
  getAvailableProviders,
  getDefaultProvider,
  getProviderDisplayName,
  getProviderIcon,
  type CloudProvider,
  type CloudBackupResult,
  type CloudRestoreResult,
  type PlatformAvailability,
} from './cloud-backup';

export {
  // Backup Service
  createBackup,
  restoreFromBackup,
  restoreFromMnemonic,
  checkPasswordStrength,
  getBackupInfo,
  isBackupNeeded,
  getRecommendedProvider,
  getProviderOptions,
  verifyBackupMatchesWallet,
  generateBackupHash,
  type CreateBackupResult,
  type RestoreBackupResult,
  type ManualRestoreResult,
  type BackupInfo,
} from './backup-service';
