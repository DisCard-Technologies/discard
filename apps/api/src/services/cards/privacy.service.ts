import crypto from 'crypto';
import { supabase } from '../../app';

export interface PrivacyContextOptions {
  userId: string;
  cardId?: string;
}

export interface DeletionProof {
  cardId: string;
  deletionKey: string;
  timestamp: string;
  signature: string;
}

export class PrivacyService {
  private readonly encryptionKey: string;
  private readonly deletionSigningKey: string;

  constructor() {
    this.encryptionKey = process.env.CARD_ENCRYPTION_KEY || '';
    this.deletionSigningKey = process.env.DELETION_SIGNING_KEY || '';
    
    if (!this.encryptionKey || !this.deletionSigningKey) {
      throw new Error('Card encryption keys are not configured');
    }
  }

  /**
   * Generate cryptographic isolation context for a user
   */
  generateCardContext(userId: string): string {
    const context = crypto.randomBytes(32);
    const userHash = crypto.createHash('sha256').update(userId).digest();
    const contextHash = crypto.createHash('sha256').update(Buffer.concat([context, userHash])).digest('hex');
    return contextHash;
  }

  /**
   * Encrypt sensitive card data using AES-256-CBC
   */
  encryptCardData(plaintext: string, additionalData?: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // For additional security, include a hash of additional data if provided
    const dataHash = additionalData ? 
      crypto.createHmac('sha256', key).update(additionalData).digest('hex') : '';
    
    // Combine IV, data hash, and encrypted data
    return `${iv.toString('hex')}:${dataHash}:${encrypted}`;
  }

  /**
   * Decrypt sensitive card data
   */
  decryptCardData(encryptedData: string, additionalData?: string): string {
    const parts = encryptedData.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [ivHex, dataHash, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    
    // Verify additional data if provided
    if (additionalData) {
      const expectedHash = crypto.createHmac('sha256', key).update(additionalData).digest('hex');
      if (dataHash !== expectedHash) {
        throw new Error('Invalid additional data');
      }
    }
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generate cryptographic deletion key for verifiable card destruction
   */
  generateDeletionKey(cardId: string): string {
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(16);
    const combined = Buffer.concat([Buffer.from(cardId), Buffer.from(timestamp), randomBytes]);
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Create cryptographic proof of card deletion
   */
  createDeletionProof(cardId: string, deletionKey: string): DeletionProof {
    const timestamp = new Date().toISOString();
    const dataToSign = `${cardId}:${deletionKey}:${timestamp}`;
    
    const signature = crypto
      .createHmac('sha256', this.deletionSigningKey)
      .update(dataToSign)
      .digest('hex');
    
    return {
      cardId,
      deletionKey,
      timestamp,
      signature
    };
  }

  /**
   * Verify cryptographic deletion proof
   */
  verifyDeletionProof(proof: DeletionProof): boolean {
    const dataToSign = `${proof.cardId}:${proof.deletionKey}:${proof.timestamp}`;
    
    const expectedSignature = crypto
      .createHmac('sha256', this.deletionSigningKey)
      .update(dataToSign)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(proof.signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Generate secure card number and CVV
   */
  generateCardCredentials(): { cardNumber: string; cvv: string } {
    // Generate a realistic card number (starts with 4 for Visa)
    const cardNumber = '4' + Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('');
    
    // Generate 3-digit CVV
    const cvv = Array.from({ length: 3 }, () => Math.floor(Math.random() * 10)).join('');
    
    return { cardNumber, cvv };
  }

  /**
   * Validate spending limit constraints
   */
  validateSpendingLimit(spendingLimit: number): { valid: boolean; message?: string } {
    if (spendingLimit < 100) {
      return { valid: false, message: 'Spending limit must be at least $1.00 (100 cents)' };
    }
    
    if (spendingLimit > 500000) {
      return { valid: false, message: 'Spending limit cannot exceed $5,000.00 (500000 cents)' };
    }
    
    return { valid: true };
  }

  /**
   * Log card deletion for cryptographic verification audit trail
   */
  async logCardDeletion(cardId: string, deletionProof: DeletionProof): Promise<void> {
    try {
      await supabase
        .from('deletion_log')
        .insert([{
          card_id: cardId,
          deletion_key: deletionProof.deletionKey,
          deletion_proof: JSON.stringify(deletionProof),
          deleted_at: deletionProof.timestamp
        }]);
    } catch (error) {
      console.error('Failed to log card deletion:', error);
      throw new Error('Failed to create deletion audit trail');
    }
  }

  /**
   * Set privacy isolation context for database queries
   */
  setPrivacyContext(cardContext: string): void {
    // This would typically set a context variable for the database connection
    // For now, we'll use it in our queries directly
    // In a real implementation, this might use Supabase RLS context variables
  }
}

export const privacyService = new PrivacyService();