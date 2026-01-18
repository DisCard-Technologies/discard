/**
 * Mnemonic Storage - Secure Local Storage for Seed Phrases
 *
 * Stores mnemonic phrases securely using:
 * - SecureStore (native) - encrypted by device keychain
 * - localStorage (web) - for development only, NOT secure
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Storage keys
const MNEMONIC_KEY = 'discard_mnemonic';
const MNEMONIC_HASH_KEY = 'discard_mnemonic_hash';
const WALLET_TYPE_KEY = 'discard_wallet_type';
const MNEMONIC_CREATED_AT_KEY = 'discard_mnemonic_created_at';
const BACKUP_STATUS_KEY = 'discard_backup_status';

/**
 * Wallet types
 */
export type WalletType = 'mnemonic' | 'keypair' | 'turnkey';

/**
 * Backup status
 */
export interface BackupStatus {
  hasCloudBackup: boolean;
  hasLocalBackup: boolean;
  lastBackupAt?: number;
  backupProvider?: 'icloud' | 'google_drive' | 'local_file';
}

/**
 * Mnemonic metadata (safe to display)
 */
export interface MnemonicMetadata {
  walletType: WalletType;
  hasStoredMnemonic: boolean;
  mnemonicFingerprint?: string; // First 8 chars of hash
  createdAt?: number;
  backupStatus: BackupStatus;
}

// Web-compatible storage wrapper
const storage = {
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      // WARNING: localStorage is NOT secure for production
      // This is only for development/testing
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

/**
 * Store a mnemonic phrase securely
 * The mnemonic is stored encrypted by the device's keychain (native)
 *
 * @param mnemonic - 12 or 24 word mnemonic phrase
 */
export async function storeMnemonicLocally(mnemonic: string): Promise<void> {
  const normalizedMnemonic = mnemonic.trim().toLowerCase();

  // Store the mnemonic
  await storage.setItem(MNEMONIC_KEY, normalizedMnemonic);

  // Store hash for fingerprint (first 8 chars)
  const hash = sha256(new TextEncoder().encode(normalizedMnemonic));
  const fingerprint = bytesToHex(hash).slice(0, 8);
  await storage.setItem(MNEMONIC_HASH_KEY, fingerprint);

  // Store metadata
  await storage.setItem(WALLET_TYPE_KEY, 'mnemonic');
  await storage.setItem(MNEMONIC_CREATED_AT_KEY, Date.now().toString());

  console.log('[MnemonicStorage] Mnemonic stored securely, fingerprint:', fingerprint);
}

/**
 * Retrieve the stored mnemonic phrase
 * WARNING: Handle the returned mnemonic with extreme care
 *
 * @returns Mnemonic phrase or null if not stored
 */
export async function getMnemonicLocally(): Promise<string | null> {
  return await storage.getItem(MNEMONIC_KEY);
}

/**
 * Check if a mnemonic wallet is stored
 *
 * @returns true if mnemonic exists
 */
export async function hasMnemonicWallet(): Promise<boolean> {
  const mnemonic = await storage.getItem(MNEMONIC_KEY);
  return mnemonic !== null && mnemonic.length > 0;
}

/**
 * Get wallet type (mnemonic, keypair, or turnkey)
 *
 * @returns WalletType or null
 */
export async function getWalletType(): Promise<WalletType | null> {
  const type = await storage.getItem(WALLET_TYPE_KEY);
  if (type === 'mnemonic' || type === 'keypair' || type === 'turnkey') {
    return type;
  }
  return null;
}

/**
 * Set wallet type
 *
 * @param type - Wallet type
 */
export async function setWalletType(type: WalletType): Promise<void> {
  await storage.setItem(WALLET_TYPE_KEY, type);
}

/**
 * Get mnemonic metadata (safe to display)
 *
 * @returns Mnemonic metadata
 */
export async function getMnemonicMetadata(): Promise<MnemonicMetadata> {
  const walletType = await getWalletType();
  const mnemonicFingerprint = await storage.getItem(MNEMONIC_HASH_KEY);
  const createdAtStr = await storage.getItem(MNEMONIC_CREATED_AT_KEY);
  const backupStatusStr = await storage.getItem(BACKUP_STATUS_KEY);

  let backupStatus: BackupStatus = {
    hasCloudBackup: false,
    hasLocalBackup: false,
  };

  if (backupStatusStr) {
    try {
      backupStatus = JSON.parse(backupStatusStr);
    } catch {
      // Ignore parse errors
    }
  }

  return {
    walletType: walletType || 'keypair',
    hasStoredMnemonic: mnemonicFingerprint !== null,
    mnemonicFingerprint: mnemonicFingerprint || undefined,
    createdAt: createdAtStr ? parseInt(createdAtStr, 10) : undefined,
    backupStatus,
  };
}

/**
 * Update backup status
 *
 * @param status - Backup status to merge
 */
export async function updateBackupStatus(status: Partial<BackupStatus>): Promise<void> {
  const currentStr = await storage.getItem(BACKUP_STATUS_KEY);
  let current: BackupStatus = {
    hasCloudBackup: false,
    hasLocalBackup: false,
  };

  if (currentStr) {
    try {
      current = JSON.parse(currentStr);
    } catch {
      // Ignore parse errors
    }
  }

  const updated = { ...current, ...status };
  await storage.setItem(BACKUP_STATUS_KEY, JSON.stringify(updated));
}

/**
 * Get backup status
 *
 * @returns Backup status
 */
export async function getBackupStatus(): Promise<BackupStatus> {
  const statusStr = await storage.getItem(BACKUP_STATUS_KEY);
  if (!statusStr) {
    return {
      hasCloudBackup: false,
      hasLocalBackup: false,
    };
  }

  try {
    return JSON.parse(statusStr);
  } catch {
    return {
      hasCloudBackup: false,
      hasLocalBackup: false,
    };
  }
}

/**
 * Delete the stored mnemonic
 * WARNING: This is irreversible if no backup exists
 *
 * @param confirmDelete - Must be true to proceed
 */
export async function deleteMnemonicLocally(confirmDelete: boolean = false): Promise<void> {
  if (!confirmDelete) {
    throw new Error('Must confirm deletion by passing confirmDelete: true');
  }

  await storage.deleteItem(MNEMONIC_KEY);
  await storage.deleteItem(MNEMONIC_HASH_KEY);
  // Keep wallet type and created at for history
  console.log('[MnemonicStorage] Mnemonic deleted from device');
}

/**
 * Clear all mnemonic-related storage
 * WARNING: Complete data loss if no backup exists
 *
 * @param confirmClear - Must be true to proceed
 */
export async function clearAllMnemonicStorage(confirmClear: boolean = false): Promise<void> {
  if (!confirmClear) {
    throw new Error('Must confirm clearing by passing confirmClear: true');
  }

  await storage.deleteItem(MNEMONIC_KEY);
  await storage.deleteItem(MNEMONIC_HASH_KEY);
  await storage.deleteItem(WALLET_TYPE_KEY);
  await storage.deleteItem(MNEMONIC_CREATED_AT_KEY);
  await storage.deleteItem(BACKUP_STATUS_KEY);

  console.log('[MnemonicStorage] All mnemonic storage cleared');
}

/**
 * Migrate from keypair wallet to mnemonic wallet
 * Stores the new mnemonic and updates wallet type
 *
 * @param mnemonic - New mnemonic to store
 */
export async function migrateToMnemonicWallet(mnemonic: string): Promise<void> {
  await storeMnemonicLocally(mnemonic);
  console.log('[MnemonicStorage] Migrated to mnemonic wallet');
}

/**
 * Verify stored mnemonic matches expected fingerprint
 *
 * @param expectedFingerprint - Expected first 8 chars of hash
 * @returns true if matches
 */
export async function verifyMnemonicFingerprint(expectedFingerprint: string): Promise<boolean> {
  const mnemonic = await getMnemonicLocally();
  if (!mnemonic) return false;

  const hash = sha256(new TextEncoder().encode(mnemonic));
  const fingerprint = bytesToHex(hash).slice(0, 8);

  return fingerprint.toLowerCase() === expectedFingerprint.toLowerCase();
}
