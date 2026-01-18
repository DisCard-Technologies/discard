/**
 * Backup Encryption - Password-Based Encryption for Seed Phrases
 *
 * Uses memory-hard key derivation (scrypt) with NaCl secretbox (XSalsa20-Poly1305)
 * for encrypting mnemonic phrases before cloud backup.
 *
 * Security Properties:
 * - Memory-hard KDF: Resistant to GPU/ASIC attacks
 * - Authenticated encryption: Detects tampering
 * - Random salt/nonce: Same password produces different ciphertexts
 * - Version field: Allows future algorithm upgrades
 */

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { scrypt } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Scrypt parameters (memory-hard, secure for passwords)
// N=2^17 (~128MB memory), r=8, p=1
// This provides strong protection against brute-force attacks
const SCRYPT_N = 131072; // 2^17 - cost factor
const SCRYPT_R = 8; // block size
const SCRYPT_P = 1; // parallelization
const SCRYPT_DKLEN = 32; // derived key length

// Current backup format version
const BACKUP_VERSION = 1;

/**
 * Encrypted backup file format
 */
export interface EncryptedBackup {
  /** Backup format version (for future upgrades) */
  version: number;
  /** Encryption algorithm identifier */
  algorithm: 'scrypt-nacl-secretbox';
  /** Base64-encoded salt (32 bytes) */
  salt: string;
  /** Base64-encoded nonce (24 bytes) */
  nonce: string;
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** SHA256 checksum of the backup content (before encryption) */
  checksum: string;
  /** Timestamp when backup was created */
  createdAt: number;
  /** Optional metadata */
  metadata?: {
    /** Wallet fingerprint (first 8 chars of mnemonic hash) */
    fingerprint?: string;
    /** Device name */
    deviceName?: string;
    /** Mnemonic word count (12 or 24) */
    wordCount?: number;
  };
}

/**
 * Password strength assessment
 */
export interface PasswordStrength {
  score: number; // 0-4 (weak to very strong)
  label: 'weak' | 'fair' | 'good' | 'strong' | 'very_strong';
  feedback: string[];
}

/**
 * Assess password strength
 *
 * @param password - Password to assess
 * @returns Strength assessment
 */
export function assessPasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  // Length checks
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (password.length < 8) {
    feedback.push('Use at least 8 characters');
  }

  // Character variety
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score++;
  } else {
    feedback.push('Mix uppercase and lowercase letters');
  }

  if (/\d/.test(password)) {
    score++;
  } else {
    feedback.push('Add numbers');
  }

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score++;
  } else {
    feedback.push('Add special characters');
  }

  // Common pattern detection
  const commonPatterns = [
    /^123/,
    /password/i,
    /qwerty/i,
    /abc/i,
    /^(.)\1+$/, // Repeated chars
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      score = Math.max(0, score - 1);
      feedback.push('Avoid common patterns');
      break;
    }
  }

  // Normalize to 0-4 scale
  score = Math.min(4, Math.max(0, Math.floor(score * 4 / 6)));

  const labels: PasswordStrength['label'][] = ['weak', 'fair', 'good', 'strong', 'very_strong'];

  return {
    score,
    label: labels[score],
    feedback: feedback.slice(0, 3), // Max 3 feedback items
  };
}

/**
 * Derive encryption key from password using scrypt
 *
 * @param password - User password
 * @param salt - Random salt (32 bytes)
 * @returns 32-byte encryption key
 */
function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  const passwordBytes = new TextEncoder().encode(password);

  return scrypt(passwordBytes, salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    dkLen: SCRYPT_DKLEN,
  });
}

/**
 * Encrypt a mnemonic phrase with a password
 *
 * @param mnemonic - Mnemonic phrase to encrypt
 * @param password - User password
 * @param metadata - Optional metadata to include
 * @returns Encrypted backup object
 */
export function encryptMnemonicWithPassword(
  mnemonic: string,
  password: string,
  metadata?: EncryptedBackup['metadata']
): EncryptedBackup {
  const normalizedMnemonic = mnemonic.trim().toLowerCase();

  // Validate password strength
  const strength = assessPasswordStrength(password);
  if (strength.score < 1) {
    throw new Error('Password too weak. ' + strength.feedback.join('. '));
  }

  // Generate random salt and nonce
  const salt = nacl.randomBytes(32);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength); // 24 bytes

  // Derive encryption key from password
  const key = deriveKey(password, salt);

  // Create checksum of plaintext (for integrity verification)
  const plaintextBytes = new TextEncoder().encode(normalizedMnemonic);
  const checksum = bytesToHex(sha256(plaintextBytes));

  // Encrypt mnemonic
  const ciphertext = nacl.secretbox(plaintextBytes, nonce, key);

  if (!ciphertext) {
    throw new Error('Encryption failed');
  }

  // Build backup object
  const backup: EncryptedBackup = {
    version: BACKUP_VERSION,
    algorithm: 'scrypt-nacl-secretbox',
    salt: naclUtil.encodeBase64(salt),
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(ciphertext),
    checksum,
    createdAt: Date.now(),
    metadata,
  };

  // Clear sensitive data from memory
  key.fill(0);
  plaintextBytes.fill(0);

  return backup;
}

/**
 * Decrypt a mnemonic phrase from an encrypted backup
 *
 * @param backup - Encrypted backup object
 * @param password - User password
 * @returns Decrypted mnemonic phrase
 * @throws Error if password is wrong or backup is corrupted
 */
export function decryptMnemonicWithPassword(
  backup: EncryptedBackup,
  password: string
): string {
  // Validate backup version
  if (backup.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${backup.version}`);
  }

  // Validate algorithm
  if (backup.algorithm !== 'scrypt-nacl-secretbox') {
    throw new Error(`Unsupported algorithm: ${backup.algorithm}`);
  }

  try {
    // Decode components
    const salt = naclUtil.decodeBase64(backup.salt);
    const nonce = naclUtil.decodeBase64(backup.nonce);
    const ciphertext = naclUtil.decodeBase64(backup.ciphertext);

    // Derive key from password
    const key = deriveKey(password, salt);

    // Decrypt
    const plaintextBytes = nacl.secretbox.open(ciphertext, nonce, key);

    // Clear key from memory
    key.fill(0);

    if (!plaintextBytes) {
      throw new Error('Invalid password or corrupted backup');
    }

    // Verify checksum
    const checksum = bytesToHex(sha256(plaintextBytes));
    if (checksum !== backup.checksum) {
      throw new Error('Backup integrity check failed - data may be corrupted');
    }

    // Decode mnemonic
    const mnemonic = new TextDecoder().decode(plaintextBytes);

    // Clear plaintext from memory
    plaintextBytes.fill(0);

    return mnemonic;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Invalid password') ||
          error.message.includes('corrupted') ||
          error.message.includes('integrity')) {
        throw error;
      }
    }
    throw new Error('Invalid password or corrupted backup');
  }
}

/**
 * Verify a backup can be decrypted without returning the mnemonic
 *
 * @param backup - Encrypted backup object
 * @param password - User password
 * @returns true if password is correct
 */
export function verifyBackupPassword(
  backup: EncryptedBackup,
  password: string
): boolean {
  try {
    const mnemonic = decryptMnemonicWithPassword(backup, password);
    // Clear from memory immediately
    mnemonic.split('').fill('');
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialize backup to JSON string for storage/transfer
 *
 * @param backup - Encrypted backup object
 * @returns JSON string
 */
export function serializeBackup(backup: EncryptedBackup): string {
  return JSON.stringify(backup, null, 2);
}

/**
 * Parse backup from JSON string
 *
 * @param json - JSON string
 * @returns Encrypted backup object
 * @throws Error if JSON is invalid
 */
export function parseBackup(json: string): EncryptedBackup {
  try {
    const backup = JSON.parse(json);

    // Validate required fields
    if (typeof backup.version !== 'number' ||
        typeof backup.algorithm !== 'string' ||
        typeof backup.salt !== 'string' ||
        typeof backup.nonce !== 'string' ||
        typeof backup.ciphertext !== 'string' ||
        typeof backup.checksum !== 'string' ||
        typeof backup.createdAt !== 'number') {
      throw new Error('Invalid backup format');
    }

    return backup as EncryptedBackup;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid backup format') {
      throw error;
    }
    throw new Error('Failed to parse backup file');
  }
}

/**
 * Get backup fingerprint for display
 * Shows first and last few characters of checksum
 *
 * @param backup - Encrypted backup object
 * @returns Fingerprint string (e.g., "a1b2...y9z0")
 */
export function getBackupFingerprint(backup: EncryptedBackup): string {
  const checksum = backup.checksum;
  if (checksum.length < 12) return checksum;
  return `${checksum.slice(0, 4)}...${checksum.slice(-4)}`;
}

/**
 * Create a backup filename with timestamp
 *
 * @param prefix - Filename prefix
 * @returns Filename string
 */
export function createBackupFilename(prefix: string = 'discard-backup'): string {
  const date = new Date();
  const timestamp = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${timestamp}.json`;
}
