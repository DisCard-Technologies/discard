/**
 * BIP39 Wallet - Mnemonic-based Solana Wallet Generation
 *
 * Generates 12-word mnemonic phrases and derives Solana keypairs using
 * the standard BIP44 derivation path: m/44'/501'/0'/0'
 */

import * as bip39 from 'bip39';
import { HDKey } from '@scure/bip32';
import { Keypair } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Standard Solana BIP44 derivation path
// m/44' - BIP44 purpose
// 501' - Solana coin type (SLIP-44)
// 0' - account index
// 0' - external chain (standard for Solana)
export const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

/**
 * Mnemonic validation result
 */
export interface MnemonicValidation {
  isValid: boolean;
  wordCount: number;
  invalidWords: string[];
}

/**
 * Wallet from mnemonic result
 */
export interface MnemonicWallet {
  mnemonic: string;
  publicKey: string;
  secretKey: Uint8Array;
  keypair: Keypair;
  derivationPath: string;
}

/**
 * Generate a new 12-word BIP39 mnemonic phrase
 * Uses 128 bits of entropy for 12 words
 *
 * @returns 12-word mnemonic phrase
 */
export function generateMnemonic(): string {
  // 128 bits = 12 words (standard security, easier to backup)
  // 256 bits = 24 words (maximum security)
  return bip39.generateMnemonic(128);
}

/**
 * Generate a 24-word mnemonic for maximum security
 * Uses 256 bits of entropy
 *
 * @returns 24-word mnemonic phrase
 */
export function generateMnemonic24(): string {
  return bip39.generateMnemonic(256);
}

/**
 * Validate a mnemonic phrase
 *
 * @param mnemonic - Mnemonic phrase to validate
 * @returns Validation result with details
 */
export function validateMnemonic(mnemonic: string): MnemonicValidation {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  const wordCount = words.length;

  // Valid word counts: 12, 15, 18, 21, 24
  const validWordCounts = [12, 15, 18, 21, 24];

  if (!validWordCounts.includes(wordCount)) {
    return {
      isValid: false,
      wordCount,
      invalidWords: [],
    };
  }

  // Check each word against BIP39 wordlist
  const wordlist = bip39.wordlists.english;
  const invalidWords = words.filter(word => !wordlist.includes(word));

  // Use bip39's built-in validation for checksum
  const isValid = bip39.validateMnemonic(mnemonic.trim().toLowerCase());

  return {
    isValid,
    wordCount,
    invalidWords,
  };
}

/**
 * Derive a Solana keypair from a mnemonic phrase
 * Uses BIP44 path: m/44'/501'/0'/0'
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param passphrase - Optional passphrase for additional security
 * @returns MnemonicWallet with keypair and metadata
 * @throws Error if mnemonic is invalid
 */
export function deriveKeypairFromMnemonic(
  mnemonic: string,
  passphrase: string = ''
): MnemonicWallet {
  const normalizedMnemonic = mnemonic.trim().toLowerCase();

  // Validate mnemonic
  const validation = validateMnemonic(normalizedMnemonic);
  if (!validation.isValid) {
    if (validation.invalidWords.length > 0) {
      throw new Error(`Invalid words in mnemonic: ${validation.invalidWords.join(', ')}`);
    }
    throw new Error('Invalid mnemonic phrase - checksum failed');
  }

  // Convert mnemonic to seed (512-bit)
  const seed = bip39.mnemonicToSeedSync(normalizedMnemonic, passphrase);

  // Create master HD key from seed
  const masterKey = HDKey.fromMasterSeed(seed);

  // Derive child key using Solana's standard path
  const derivedKey = masterKey.derive(SOLANA_DERIVATION_PATH);

  if (!derivedKey.privateKey) {
    throw new Error('Failed to derive private key from mnemonic');
  }

  // Create Solana keypair from the 32-byte private key
  // Solana expects a 64-byte secret key (32-byte private + 32-byte public)
  const keypair = Keypair.fromSeed(derivedKey.privateKey);

  return {
    mnemonic: normalizedMnemonic,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: keypair.secretKey,
    keypair,
    derivationPath: SOLANA_DERIVATION_PATH,
  };
}

/**
 * Derive multiple accounts from a mnemonic
 * Uses incremental account indices: m/44'/501'/N'/0'
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param count - Number of accounts to derive
 * @param passphrase - Optional passphrase
 * @returns Array of derived wallets
 */
export function deriveMultipleAccounts(
  mnemonic: string,
  count: number = 5,
  passphrase: string = ''
): MnemonicWallet[] {
  const normalizedMnemonic = mnemonic.trim().toLowerCase();

  // Validate mnemonic
  const validation = validateMnemonic(normalizedMnemonic);
  if (!validation.isValid) {
    throw new Error('Invalid mnemonic phrase');
  }

  const seed = bip39.mnemonicToSeedSync(normalizedMnemonic, passphrase);
  const masterKey = HDKey.fromMasterSeed(seed);

  const wallets: MnemonicWallet[] = [];

  for (let i = 0; i < count; i++) {
    const path = `m/44'/501'/${i}'/0'`;
    const derivedKey = masterKey.derive(path);

    if (!derivedKey.privateKey) {
      throw new Error(`Failed to derive private key for account ${i}`);
    }

    const keypair = Keypair.fromSeed(derivedKey.privateKey);

    wallets.push({
      mnemonic: normalizedMnemonic,
      publicKey: keypair.publicKey.toBase58(),
      secretKey: keypair.secretKey,
      keypair,
      derivationPath: path,
    });
  }

  return wallets;
}

/**
 * Get a checksum hash of a mnemonic for verification purposes
 * Does NOT expose the mnemonic itself
 *
 * @param mnemonic - Mnemonic to hash
 * @returns Hex-encoded hash (first 8 chars)
 */
export function getMnemonicFingerprint(mnemonic: string): string {
  const normalizedMnemonic = mnemonic.trim().toLowerCase();
  const hash = sha256(new TextEncoder().encode(normalizedMnemonic));
  return bytesToHex(hash).slice(0, 8);
}

/**
 * Get the BIP39 wordlist for autocomplete
 *
 * @returns Array of 2048 BIP39 English words
 */
export function getWordlist(): string[] {
  return bip39.wordlists.english;
}

/**
 * Suggest words based on prefix for autocomplete
 *
 * @param prefix - Word prefix to match
 * @param limit - Maximum number of suggestions
 * @returns Array of matching words
 */
export function suggestWords(prefix: string, limit: number = 5): string[] {
  const normalizedPrefix = prefix.toLowerCase().trim();
  if (!normalizedPrefix) return [];

  const wordlist = bip39.wordlists.english;
  const matches = wordlist.filter(word => word.startsWith(normalizedPrefix));

  return matches.slice(0, limit);
}

/**
 * Split mnemonic into word array
 *
 * @param mnemonic - Mnemonic phrase
 * @returns Array of words
 */
export function splitMnemonic(mnemonic: string): string[] {
  return mnemonic.trim().toLowerCase().split(/\s+/);
}

/**
 * Join word array into mnemonic phrase
 *
 * @param words - Array of words
 * @returns Mnemonic phrase
 */
export function joinMnemonic(words: string[]): string {
  return words.map(w => w.toLowerCase().trim()).join(' ');
}
