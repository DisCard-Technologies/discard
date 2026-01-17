/**
 * Stealth Address Tests
 * 
 * Tests for X25519 ECDH-based stealth address generation
 */

import { Keypair } from '@solana/web3.js';
import {
  generateStealthAddress,
  deriveStealthKey,
  isOwnStealthAddress,
  generateBatch,
  scanAddresses,
} from '@/lib/stealth/address-generator';

describe('Stealth Address Generator', () => {
  describe('generateStealthAddress', () => {
    test('should generate valid stealth address', async () => {
      const recipient = Keypair.generate();
      
      const stealth = await generateStealthAddress(recipient.publicKey);
      
      expect(stealth.address).toBeDefined();
      expect(stealth.ephemeralPubKey).toBeDefined();
      expect(stealth.sharedSecretHash).toBeDefined();
      expect(stealth.createdAt).toBeGreaterThan(0);
      expect(typeof stealth.address).toBe('string');
      expect(stealth.address.length).toBeGreaterThan(0);
    });
    
    test('should generate different addresses each time', async () => {
      const recipient = Keypair.generate();
      
      const stealth1 = await generateStealthAddress(recipient.publicKey);
      const stealth2 = await generateStealthAddress(recipient.publicKey);
      
      // Different ephemeral keys = different stealth addresses
      expect(stealth1.address).not.toBe(stealth2.address);
      expect(stealth1.ephemeralPubKey).not.toBe(stealth2.ephemeralPubKey);
      expect(stealth1.sharedSecretHash).not.toBe(stealth2.sharedSecretHash);
    });
    
    test('should work with string public key', async () => {
      const recipient = Keypair.generate();
      const pubKeyString = recipient.publicKey.toBase58();
      
      const stealth = await generateStealthAddress(pubKeyString);
      
      expect(stealth.address).toBeDefined();
    });
  });
  
  describe('deriveStealthKey', () => {
    test('should derive correct stealth private key', async () => {
      const recipient = Keypair.generate();
      
      // Generate stealth address
      const stealth = await generateStealthAddress(recipient.publicKey);
      
      // Recipient derives the private key
      const derived = await deriveStealthKey(
        recipient.secretKey,
        stealth.ephemeralPubKey
      );
      
      // Should derive the same address
      expect(derived.address).toBe(stealth.address);
      expect(derived.privateKey).toBeDefined();
      expect(derived.publicKey).toBeDefined();
    });
    
    test('should fail with wrong recipient key', async () => {
      const recipient = Keypair.generate();
      const wrongRecipient = Keypair.generate();
      
      const stealth = await generateStealthAddress(recipient.publicKey);
      
      // Wrong recipient derives different address
      const derived = await deriveStealthKey(
        wrongRecipient.secretKey,
        stealth.ephemeralPubKey
      );
      
      expect(derived.address).not.toBe(stealth.address);
    });
  });
  
  describe('isOwnStealthAddress', () => {
    test('should return true for own address', async () => {
      const recipient = Keypair.generate();
      
      const stealth = await generateStealthAddress(recipient.publicKey);
      
      const isOwn = await isOwnStealthAddress(
        stealth.address,
        recipient.secretKey,
        stealth.ephemeralPubKey
      );
      
      expect(isOwn).toBe(true);
    });
    
    test('should return false for other address', async () => {
      const recipient = Keypair.generate();
      const other = Keypair.generate();
      
      const stealth = await generateStealthAddress(recipient.publicKey);
      
      const isOwn = await isOwnStealthAddress(
        stealth.address,
        other.secretKey, // Wrong private key
        stealth.ephemeralPubKey
      );
      
      expect(isOwn).toBe(false);
    });
    
    test('should handle invalid ephemeral public key', async () => {
      const recipient = Keypair.generate();
      const stealth = await generateStealthAddress(recipient.publicKey);
      
      const isOwn = await isOwnStealthAddress(
        stealth.address,
        recipient.secretKey,
        'invalid-key'
      );
      
      expect(isOwn).toBe(false);
    });
  });
  
  describe('generateBatch', () => {
    test('should generate multiple stealth addresses', async () => {
      const recipient = Keypair.generate();
      const count = 5;
      
      const addresses = await generateBatch(recipient.publicKey, count);
      
      expect(addresses.length).toBe(count);
      
      // All should be unique
      const uniqueAddresses = new Set(addresses.map(a => a.address));
      expect(uniqueAddresses.size).toBe(count);
      
      // All should be valid
      for (const addr of addresses) {
        expect(addr.address).toBeDefined();
        expect(addr.ephemeralPubKey).toBeDefined();
        expect(addr.sharedSecretHash).toBeDefined();
      }
    });
    
    test('should work with zero count', async () => {
      const recipient = Keypair.generate();
      
      const addresses = await generateBatch(recipient.publicKey, 0);
      
      expect(addresses.length).toBe(0);
    });
  });
  
  describe('scanAddresses', () => {
    test('should find own addresses in batch', async () => {
      const recipient = Keypair.generate();
      const other = Keypair.generate();
      
      // Generate some addresses for recipient
      const recipientAddresses = await generateBatch(recipient.publicKey, 3);
      
      // Generate some addresses for other (noise)
      const otherAddresses = await generateBatch(other.publicKey, 2);
      
      // Mix them together
      const allAddresses = [...recipientAddresses, ...otherAddresses];
      
      // Shuffle
      allAddresses.sort(() => Math.random() - 0.5);
      
      // Scan for recipient's addresses
      const found = await scanAddresses(allAddresses, recipient.secretKey);
      
      // Should find exactly 3 (recipient's addresses)
      expect(found.length).toBe(3);
      
      // Verify they're the correct ones
      const foundAddresses = new Set(found.map(f => f.address));
      for (const addr of recipientAddresses) {
        expect(foundAddresses.has(addr.address)).toBe(true);
      }
    });
    
    test('should return empty array when no matches', async () => {
      const recipient = Keypair.generate();
      const other = Keypair.generate();
      
      // Generate addresses for other person
      const addresses = await generateBatch(other.publicKey, 5);
      
      // Try to find with recipient's key
      const found = await scanAddresses(addresses, recipient.secretKey);
      
      expect(found.length).toBe(0);
    });
    
    test('should handle empty address list', async () => {
      const recipient = Keypair.generate();
      
      const found = await scanAddresses([], recipient.secretKey);
      
      expect(found.length).toBe(0);
    });
  });
  
  describe('ECDH Properties', () => {
    test('shared secret should be same for both parties', async () => {
      // This tests the fundamental ECDH property:
      // x25519(privA, pubB) === x25519(privB, pubA)
      
      const alice = Keypair.generate();
      const bob = Keypair.generate();
      
      // Alice generates stealth address for Bob
      const stealthForBob = await generateStealthAddress(bob.publicKey);
      
      // Bob derives the stealth key
      const bobDerived = await deriveStealthKey(
        bob.secretKey,
        stealthForBob.ephemeralPubKey
      );
      
      // Bob can verify ownership
      const isOwn = await isOwnStealthAddress(
        stealthForBob.address,
        bob.secretKey,
        stealthForBob.ephemeralPubKey
      );
      
      expect(isOwn).toBe(true);
      expect(bobDerived.address).toBe(stealthForBob.address);
    });
    
    test('different ephemeral keys produce different addresses', async () => {
      const recipient = Keypair.generate();
      
      // Generate 10 stealth addresses
      const addresses = await generateBatch(recipient.publicKey, 10);
      
      // All should have different ephemeral keys
      const ephemeralKeys = new Set(addresses.map(a => a.ephemeralPubKey));
      expect(ephemeralKeys.size).toBe(10);
      
      // All should have different addresses
      const stealthAddresses = new Set(addresses.map(a => a.address));
      expect(stealthAddresses.size).toBe(10);
      
      // All should have different shared secrets
      const sharedSecrets = new Set(addresses.map(a => a.sharedSecretHash));
      expect(sharedSecrets.size).toBe(10);
    });
  });
  
  describe('Privacy Properties', () => {
    test('stealth address should not be linkable to recipient', async () => {
      const recipient = Keypair.generate();
      const recipientPubKey = recipient.publicKey.toBase58();
      
      const stealth = await generateStealthAddress(recipient.publicKey);
      
      // Stealth address should not contain recipient's public key
      expect(stealth.address).not.toContain(recipientPubKey);
      
      // First 8 characters should be different
      expect(stealth.address.slice(0, 8)).not.toBe(recipientPubKey.slice(0, 8));
    });
    
    test('multiple stealth addresses should be unlinkable', async () => {
      const recipient = Keypair.generate();
      
      const stealth1 = await generateStealthAddress(recipient.publicKey);
      const stealth2 = await generateStealthAddress(recipient.publicKey);
      const stealth3 = await generateStealthAddress(recipient.publicKey);
      
      // Should not share common prefixes (beyond random chance)
      const addresses = [stealth1.address, stealth2.address, stealth3.address];
      
      // Check that at least 2 have different first characters
      const firstChars = new Set(addresses.map(a => a[0]));
      expect(firstChars.size).toBeGreaterThan(1);
    });
    
    test('ephemeral public key reveals no information about recipient', async () => {
      const recipient = Keypair.generate();
      const recipientPubKey = recipient.publicKey.toBase58();
      
      const stealth = await generateStealthAddress(recipient.publicKey);
      
      // Ephemeral key should not be related to recipient key
      expect(stealth.ephemeralPubKey).not.toBe(recipientPubKey);
      expect(stealth.ephemeralPubKey.slice(0, 8)).not.toBe(recipientPubKey.slice(0, 8));
    });
  });
  
  describe('Edge Cases', () => {
    test('should handle rapid successive generations', async () => {
      const recipient = Keypair.generate();
      
      // Generate many addresses quickly
      const promises = Array(50).fill(null).map(() => 
        generateStealthAddress(recipient.publicKey)
      );
      
      const addresses = await Promise.all(promises);
      
      // All should be unique
      const uniqueAddresses = new Set(addresses.map(a => a.address));
      expect(uniqueAddresses.size).toBe(50);
    });
    
    test('should work with keys from different sources', async () => {
      // Test with multiple generated keypairs
      for (let i = 0; i < 5; i++) {
        const recipient = Keypair.generate();
        const stealth = await generateStealthAddress(recipient.publicKey);
        
        const derived = await deriveStealthKey(
          recipient.secretKey,
          stealth.ephemeralPubKey
        );
        
        expect(derived.address).toBe(stealth.address);
      }
    });
  });
  
  describe('Performance', () => {
    test('generation should be reasonably fast', async () => {
      const recipient = Keypair.generate();
      
      const start = Date.now();
      await generateStealthAddress(recipient.publicKey);
      const duration = Date.now() - start;
      
      // Should complete in less than 100ms
      expect(duration).toBeLessThan(100);
    });
    
    test('batch generation should be efficient', async () => {
      const recipient = Keypair.generate();
      const count = 100;
      
      const start = Date.now();
      await generateBatch(recipient.publicKey, count);
      const duration = Date.now() - start;
      
      // Should average less than 10ms per address
      const avgTime = duration / count;
      expect(avgTime).toBeLessThan(10);
    });
    
    test('scanning should be reasonably fast', async () => {
      const recipient = Keypair.generate();
      const addresses = await generateBatch(recipient.publicKey, 20);
      
      const start = Date.now();
      await scanAddresses(addresses, recipient.secretKey);
      const duration = Date.now() - start;
      
      // Should scan 20 addresses in less than 500ms
      expect(duration).toBeLessThan(500);
    });
  });
});
