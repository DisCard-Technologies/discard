/**
 * ElGamal Encryption Tests
 * 
 * Tests for twisted ElGamal encryption on elliptic curves
 */

import {
  generateKeypair,
  deriveKeypair,
  encrypt,
  decrypt,
  add,
  rerandomize,
  verifyCiphertext,
  serializeCiphertext,
  deserializeCiphertext,
  serializePublicKey,
  deserializePublicKey,
} from '@/lib/crypto/elgamal';

describe('ElGamal Encryption', () => {
  describe('Key Generation', () => {
    test('should generate valid keypair', () => {
      const keypair = generateKeypair();
      
      expect(keypair.publicKey).toBeDefined();
      expect(keypair.privateKey).toBeDefined();
      expect(keypair.publicKey.point).toBeDefined();
      expect(keypair.privateKey.scalar).toBeDefined();
    });
    
    test('should generate different keypairs', () => {
      const keypair1 = generateKeypair();
      const keypair2 = generateKeypair();
      
      const pk1 = serializePublicKey(keypair1.publicKey);
      const pk2 = serializePublicKey(keypair2.publicKey);
      
      expect(pk1).not.toBe(pk2);
    });
    
    test('should derive deterministic keypair from seed', () => {
      const seed = new Uint8Array(32);
      seed.fill(42);
      
      const keypair1 = deriveKeypair(seed);
      const keypair2 = deriveKeypair(seed);
      
      const pk1 = serializePublicKey(keypair1.publicKey);
      const pk2 = serializePublicKey(keypair2.publicKey);
      
      expect(pk1).toBe(pk2);
    });
  });
  
  describe('Encryption/Decryption', () => {
    test('should encrypt and decrypt correctly', () => {
      const keypair = generateKeypair();
      const amount = 1000n;
      
      const ciphertext = encrypt(amount, keypair.publicKey);
      const decrypted = decrypt(ciphertext, keypair.privateKey);
      
      expect(decrypted).toBe(amount);
    });
    
    test('should work with zero amount', () => {
      const keypair = generateKeypair();
      const amount = 0n;
      
      const ciphertext = encrypt(amount, keypair.publicKey);
      const decrypted = decrypt(ciphertext, keypair.privateKey);
      
      expect(decrypted).toBe(amount);
    });
    
    test('should work with maximum supported amount', () => {
      const keypair = generateKeypair();
      // Max for direct encoding: 2^24 for reasonable performance
      const amount = 16_777_215n; // 2^24 - 1
      
      const ciphertext = encrypt(amount, keypair.publicKey);
      const decrypted = decrypt(ciphertext, keypair.privateKey);
      
      expect(decrypted).toBe(amount);
    }, 30000); // 30 second timeout for large amount
    
    test('should produce different ciphertexts for same amount', () => {
      const keypair = generateKeypair();
      const amount = 500n;
      
      const ct1 = encrypt(amount, keypair.publicKey);
      const ct2 = encrypt(amount, keypair.publicKey);
      
      // Different ephemeral keys = different ciphertexts
      const s1 = serializeCiphertext(ct1);
      const s2 = serializeCiphertext(ct2);
      
      expect(s1.ephemeral).not.toBe(s2.ephemeral);
      expect(s1.encrypted).not.toBe(s2.encrypted);
      
      // But both decrypt to same amount
      expect(decrypt(ct1, keypair.privateKey)).toBe(amount);
      expect(decrypt(ct2, keypair.privateKey)).toBe(amount);
    });
    
    test('should fail decryption with wrong key', () => {
      const keypair1 = generateKeypair();
      const keypair2 = generateKeypair();
      const amount = 1000n;
      
      const ciphertext = encrypt(amount, keypair1.publicKey);
      const decrypted = decrypt(ciphertext, keypair2.privateKey);
      
      // Should decrypt to wrong value (not throw)
      expect(decrypted).not.toBe(amount);
    });
  });
  
  describe('Homomorphic Addition', () => {
    test('should add encrypted amounts', () => {
      const keypair = generateKeypair();
      const amount1 = 100n;
      const amount2 = 200n;
      
      const ct1 = encrypt(amount1, keypair.publicKey);
      const ct2 = encrypt(amount2, keypair.publicKey);
      
      // Homomorphic addition: E(a) + E(b) = E(a + b)
      const ctSum = add(ct1, ct2);
      const decryptedSum = decrypt(ctSum, keypair.privateKey);
      
      expect(decryptedSum).toBe(amount1 + amount2);
    });
    
    test('should add multiple encrypted amounts', () => {
      const keypair = generateKeypair();
      const amounts = [50n, 100n, 150n, 200n];
      
      // Encrypt all amounts
      const ciphertexts = amounts.map(a => encrypt(a, keypair.publicKey));
      
      // Sum all ciphertexts
      let ctSum = ciphertexts[0];
      for (let i = 1; i < ciphertexts.length; i++) {
        ctSum = add(ctSum, ciphertexts[i]);
      }
      
      // Decrypt sum
      const decryptedSum = decrypt(ctSum, keypair.privateKey);
      const expectedSum = amounts.reduce((sum, a) => sum + a, 0n);
      
      expect(decryptedSum).toBe(expectedSum);
    });
  });
  
  describe('Rerandomization', () => {
    test('should rerandomize ciphertext', () => {
      const keypair = generateKeypair();
      const amount = 1000n;
      
      const ct1 = encrypt(amount, keypair.publicKey);
      const ct2 = rerandomize(ct1, keypair.publicKey);
      
      // Ciphertexts should be different
      const s1 = serializeCiphertext(ct1);
      const s2 = serializeCiphertext(ct2);
      expect(s1.ephemeral).not.toBe(s2.ephemeral);
      expect(s1.encrypted).not.toBe(s2.encrypted);
      
      // But both should decrypt to same amount
      expect(decrypt(ct1, keypair.privateKey)).toBe(amount);
      expect(decrypt(ct2, keypair.privateKey)).toBe(amount);
    });
    
    test('multiple rerandomizations should be unlinkable', () => {
      const keypair = generateKeypair();
      const amount = 500n;
      
      const original = encrypt(amount, keypair.publicKey);
      const rerand1 = rerandomize(original, keypair.publicKey);
      const rerand2 = rerandomize(original, keypair.publicKey);
      const rerand3 = rerandomize(rerand1, keypair.publicKey);
      
      // All should be different
      const serialized = [original, rerand1, rerand2, rerand3].map(serializeCiphertext);
      const ephemeralSet = new Set(serialized.map(s => s.ephemeral));
      expect(ephemeralSet.size).toBe(4);
      
      // All should decrypt to same amount
      expect(decrypt(original, keypair.privateKey)).toBe(amount);
      expect(decrypt(rerand1, keypair.privateKey)).toBe(amount);
      expect(decrypt(rerand2, keypair.privateKey)).toBe(amount);
      expect(decrypt(rerand3, keypair.privateKey)).toBe(amount);
    });
  });
  
  describe('Serialization', () => {
    test('should serialize and deserialize ciphertext', () => {
      const keypair = generateKeypair();
      const amount = 1000n;
      
      const ciphertext = encrypt(amount, keypair.publicKey);
      const serialized = serializeCiphertext(ciphertext);
      const deserialized = deserializeCiphertext(serialized);
      
      // Should decrypt to same amount
      expect(decrypt(deserialized, keypair.privateKey)).toBe(amount);
    });
    
    test('should serialize and deserialize public key', () => {
      const keypair = generateKeypair();
      const amount = 500n;
      
      const serialized = serializePublicKey(keypair.publicKey);
      const deserialized = deserializePublicKey(serialized);
      
      // Should work with deserialized key
      const ciphertext = encrypt(amount, deserialized);
      const decrypted = decrypt(ciphertext, keypair.privateKey);
      
      expect(decrypted).toBe(amount);
    });
  });
  
  describe('Verification', () => {
    test('should verify correct ciphertext', () => {
      const keypair = generateKeypair();
      const amount = 1000n;
      
      const ciphertext = encrypt(amount, keypair.publicKey);
      const valid = verifyCiphertext(ciphertext, amount, keypair.privateKey);
      
      expect(valid).toBe(true);
    });
    
    test('should reject incorrect expected amount', () => {
      const keypair = generateKeypair();
      const amount = 1000n;
      
      const ciphertext = encrypt(amount, keypair.publicKey);
      const valid = verifyCiphertext(ciphertext, 2000n, keypair.privateKey);
      
      expect(valid).toBe(false);
    });
  });
  
  describe('Use Cases', () => {
    test('shielded pool deposit', () => {
      // Pool's keypair
      const poolKeypair = generateKeypair();
      
      // User deposits 1000 (e.g., $10.00 with 2 decimals)
      const depositAmount = 1000n;
      
      // Encrypt amount for pool
      const encryptedAmount = encrypt(depositAmount, poolKeypair.publicKey);
      
      // Pool can decrypt (in production, via ZK proof)
      const decryptedAmount = decrypt(encryptedAmount, poolKeypair.privateKey);
      
      expect(decryptedAmount).toBe(depositAmount);
    });
    
    test('shielded pool withdrawal', () => {
      const poolKeypair = generateKeypair();
      
      // User has encrypted balance in pool
      const balance = encrypt(5000n, poolKeypair.publicKey);
      const withdrawAmount = 1000n;
      
      // User proves they have sufficient balance via ZK
      // Pool verifies and processes withdrawal
      
      const decryptedBalance = decrypt(balance, poolKeypair.privateKey);
      expect(decryptedBalance).toBeGreaterThanOrEqual(withdrawAmount);
    });
    
    test('pool aggregation with homomorphic addition', () => {
      const poolKeypair = generateKeypair();
      
      // Multiple users deposit
      const deposit1 = encrypt(1000n, poolKeypair.publicKey);
      const deposit2 = encrypt(2000n, poolKeypair.publicKey);
      const deposit3 = encrypt(1500n, poolKeypair.publicKey);
      
      // Pool aggregates (without decrypting individual amounts)
      let totalEncrypted = deposit1;
      totalEncrypted = add(totalEncrypted, deposit2);
      totalEncrypted = add(totalEncrypted, deposit3);
      
      // Pool can decrypt total
      const total = decrypt(totalEncrypted, poolKeypair.privateKey);
      expect(total).toBe(4500n);
    });
  });
});
