/**
 * Cryptographic Utilities
 * 
 * Production-grade encryption/decryption using NaCl (TweetNaCl)
 * with proper key derivation via HKDF.
 */

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derive an encryption key from a private key using HKDF-SHA256
 * 
 * @param privateKey - Source private key (e.g., wallet private key)
 * @param context - Application-specific context string
 * @param salt - Optional salt (uses zero salt if not provided)
 * @returns Derived 32-byte encryption key
 */
export async function deriveEncryptionKey(
  privateKey: Uint8Array,
  context: string,
  salt?: Uint8Array
): Promise<Uint8Array> {
  // Use first 32 bytes of private key as key material
  const keyMaterial = privateKey.slice(0, 32);
  
  // Use provided salt or generate zero salt
  const actualSalt = salt || new Uint8Array(32);
  
  // Info parameter includes context
  const info = new TextEncoder().encode(context);
  
  // HKDF-Expand using SHA256
  // PRK = HMAC(salt, IKM)
  const prk = await hmacSha256(actualSalt, keyMaterial);
  
  // OKM = HMAC(PRK, info || 0x01)
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 0x01;
  
  const okm = await hmacSha256(prk, infoWithCounter);
  
  // Return first 32 bytes as encryption key
  return okm.slice(0, 32);
}

/**
 * HMAC-SHA256 implementation
 */
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const blockSize = 64; // SHA-256 block size
  
  // Adjust key length
  let adjustedKey: Uint8Array;
  if (key.length > blockSize) {
    adjustedKey = sha256(key);
  } else if (key.length < blockSize) {
    adjustedKey = new Uint8Array(blockSize);
    adjustedKey.set(key);
  } else {
    adjustedKey = key;
  }
  
  // Inner and outer padding
  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = adjustedKey[i] ^ 0x36;
    opad[i] = adjustedKey[i] ^ 0x5c;
  }
  
  // HMAC = H(opad || H(ipad || message))
  const innerHash = sha256(new Uint8Array([...ipad, ...data]));
  const hmac = sha256(new Uint8Array([...opad, ...innerHash]));
  
  return hmac;
}

// ============================================================================
// Symmetric Encryption (NaCl secretbox)
// ============================================================================

/**
 * Encrypt data using NaCl secretbox (XSalsa20-Poly1305)
 * 
 * This provides:
 * - Confidentiality (XSalsa20 stream cipher)
 * - Authentication (Poly1305 MAC)
 * - 24-byte nonce (randomly generated per encryption)
 * 
 * @param plaintext - Data to encrypt
 * @param encryptionKey - 32-byte encryption key
 * @returns Base64-encoded ciphertext (includes nonce prefix)
 */
export function encryptData(plaintext: string, encryptionKey: Uint8Array): string {
  // Convert plaintext to bytes
  const plaintextBytes = naclUtil.decodeUTF8(plaintext);
  
  // Generate random nonce (24 bytes for XSalsa20)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  
  // Encrypt with authenticated encryption
  const ciphertext = nacl.secretbox(plaintextBytes, nonce, encryptionKey);
  
  if (!ciphertext) {
    throw new Error('Encryption failed');
  }
  
  // Combine nonce + ciphertext for storage
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  
  // Return as base64 for storage
  return naclUtil.encodeBase64(combined);
}

/**
 * Decrypt data encrypted with encryptData
 * 
 * @param ciphertext - Base64-encoded ciphertext (with nonce prefix)
 * @param encryptionKey - 32-byte encryption key (must match encryption key)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong key or tampered data)
 */
export function decryptData(ciphertext: string, encryptionKey: Uint8Array): string {
  try {
    // Decode from base64
    const combined = naclUtil.decodeBase64(ciphertext);
    
    // Split nonce and ciphertext
    const nonce = combined.slice(0, nacl.secretbox.nonceLength);
    const encryptedData = combined.slice(nacl.secretbox.nonceLength);
    
    // Decrypt and verify MAC
    const decrypted = nacl.secretbox.open(encryptedData, nonce, encryptionKey);
    
    if (!decrypted) {
      throw new Error('Decryption failed - invalid key or corrupted data');
    }
    
    // Convert back to string
    return naclUtil.encodeUTF8(decrypted);
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Asymmetric Encryption (NaCl box)
// ============================================================================

/**
 * Encrypt data for a specific recipient using their public key
 * 
 * Uses X25519-XSalsa20-Poly1305 (NaCl box)
 * 
 * @param plaintext - Data to encrypt
 * @param recipientPublicKey - Recipient's 32-byte public key
 * @param senderPrivateKey - Sender's 32-byte private key
 * @returns Base64-encoded ciphertext (includes nonce and ephemeral public key)
 */
export function encryptForRecipient(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  senderPrivateKey?: Uint8Array
): string {
  // Generate ephemeral keypair if sender key not provided
  const ephemeralKeypair = senderPrivateKey
    ? { secretKey: senderPrivateKey, publicKey: nacl.box.keyPair.fromSecretKey(senderPrivateKey).publicKey }
    : nacl.box.keyPair();
  
  // Convert plaintext to bytes
  const plaintextBytes = naclUtil.decodeUTF8(plaintext);
  
  // Generate random nonce
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  
  // Encrypt using box (ECDH + secretbox)
  const ciphertext = nacl.box(
    plaintextBytes,
    nonce,
    recipientPublicKey.slice(0, 32),
    ephemeralKeypair.secretKey.slice(0, 32)
  );
  
  if (!ciphertext) {
    throw new Error('Asymmetric encryption failed');
  }
  
  // Combine ephemeral public key + nonce + ciphertext
  const combined = new Uint8Array(32 + nonce.length + ciphertext.length);
  combined.set(ephemeralKeypair.publicKey.slice(0, 32));
  combined.set(nonce, 32);
  combined.set(ciphertext, 32 + nonce.length);
  
  return naclUtil.encodeBase64(combined);
}

/**
 * Decrypt data encrypted with encryptForRecipient
 * 
 * @param ciphertext - Base64-encoded ciphertext
 * @param recipientPrivateKey - Recipient's 32-byte private key
 * @returns Decrypted plaintext
 * @throws Error if decryption fails
 */
export function decryptFromSender(
  ciphertext: string,
  recipientPrivateKey: Uint8Array
): string {
  try {
    // Decode from base64
    const combined = naclUtil.decodeBase64(ciphertext);
    
    // Split components
    const senderPublicKey = combined.slice(0, 32);
    const nonce = combined.slice(32, 32 + nacl.box.nonceLength);
    const encryptedData = combined.slice(32 + nacl.box.nonceLength);
    
    // Decrypt using box
    const decrypted = nacl.box.open(
      encryptedData,
      nonce,
      senderPublicKey,
      recipientPrivateKey.slice(0, 32)
    );
    
    if (!decrypted) {
      throw new Error('Asymmetric decryption failed - invalid key or corrupted data');
    }
    
    return naclUtil.encodeUTF8(decrypted);
  } catch (error) {
    throw new Error(
      `Asymmetric decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a cryptographically secure random key
 * 
 * @param length - Key length in bytes (default: 32)
 * @returns Random key
 */
export function generateRandomKey(length: number = 32): Uint8Array {
  return nacl.randomBytes(length);
}

/**
 * Securely compare two byte arrays in constant time
 * Prevents timing attacks
 * 
 * @param a - First array
 * @param b - Second array
 * @returns True if arrays are equal
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  return result === 0;
}

/**
 * Generate a cryptographic hash of data
 * 
 * @param data - Data to hash
 * @returns Hex-encoded hash
 */
export function hashData(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return bytesToHex(sha256(bytes));
}

// ============================================================================
// Export Types
// ============================================================================

export interface EncryptionContext {
  version: number;
  context: string;
  timestamp: number;
}

export interface EncryptedData {
  ciphertext: string;
  context: EncryptionContext;
  algorithm: 'nacl-secretbox' | 'nacl-box';
}
