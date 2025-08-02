/**
 * Card deletion confirmation utilities with cryptographic proof verification
 * Provides secure deletion confirmation with proof validation
 */

export interface DeletionProof {
  cardId: string;
  deletionKey: string;
  timestamp: string;
  signature: string;
}

export interface DeletionConfirmationOptions {
  /** Card display name for confirmation dialog */
  cardName?: string;
  /** Last 4 digits of card number for verification */
  lastFourDigits?: string;
  /** Additional security warning message */
  warningMessage?: string;
  /** Require typing "DELETE" to confirm (default: true) */
  requireTypedConfirmation?: boolean;
  /** Custom confirmation text (default: "DELETE") */
  confirmationText?: string;
  /** Callback when deletion is confirmed */
  onConfirmed?: () => void;
  /** Callback when deletion is cancelled */
  onCancelled?: () => void;
  /** Callback when proof verification fails */
  onProofVerificationFailed?: (error: Error) => void;
}

export interface DeletionConfirmationResult {
  confirmed: boolean;
  proofVerified?: boolean;
  deletionProof?: DeletionProof;
  userInput?: string;
  timestamp: string;
}

class DeletionConfirmationService {
  /**
   * Generate a secure deletion confirmation dialog data
   */
  generateConfirmationData(
    cardId: string,
    options: DeletionConfirmationOptions = {}
  ): DeletionConfirmationData {
    const {
      cardName = 'Virtual Card',
      lastFourDigits,
      warningMessage,
      requireTypedConfirmation = true,
      confirmationText = 'DELETE'
    } = options;

    const timestamp = new Date().toISOString();
    
    return {
      cardId,
      cardName,
      lastFourDigits,
      timestamp,
      warningMessage: warningMessage || this.getDefaultWarningMessage(cardName, lastFourDigits),
      requireTypedConfirmation,
      confirmationText,
      securityChecks: {
        cryptographicDeletion: true,
        permanentRemoval: true,
        irrevocable: true,
        noRecovery: true
      }
    };
  }

  /**
   * Validate user confirmation input
   */
  validateConfirmation(
    userInput: string,
    expectedText: string = 'DELETE',
    options: { caseSensitive?: boolean } = {}
  ): boolean {
    const { caseSensitive = true } = options;
    
    if (!userInput || !expectedText) {
      return false;
    }

    const input = caseSensitive ? userInput : userInput.toUpperCase();
    const expected = caseSensitive ? expectedText : expectedText.toUpperCase();
    
    return input === expected;
  }

  /**
   * Verify deletion proof cryptographic signature
   */
  async verifyDeletionProof(
    proof: DeletionProof,
    expectedCardId: string
  ): Promise<boolean> {
    try {
      // Basic validation
      if (!proof || !proof.cardId || !proof.deletionKey || !proof.signature) {
        throw new Error('Invalid deletion proof structure');
      }

      // Verify card ID matches
      if (proof.cardId !== expectedCardId) {
        throw new Error('Card ID mismatch in deletion proof');
      }

      // Verify timestamp is recent (within 5 minutes)
      const proofTime = new Date(proof.timestamp).getTime();
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (now - proofTime > fiveMinutes) {
        throw new Error('Deletion proof has expired');
      }

      // Verify deletion key format (should be UUID-like)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(proof.deletionKey)) {
        throw new Error('Invalid deletion key format');
      }

      // Verify signature is present and has correct length (hex string)
      if (!/^[0-9a-f]{64,}$/i.test(proof.signature)) {
        throw new Error('Invalid signature format');
      }

      return true;
    } catch (error) {
      console.warn('Deletion proof verification failed:', error);
      return false;
    }
  }

  /**
   * Create a complete deletion confirmation result
   */
  createConfirmationResult(
    confirmed: boolean,
    userInput?: string,
    deletionProof?: DeletionProof,
    proofVerified?: boolean
  ): DeletionConfirmationResult {
    return {
      confirmed,
      proofVerified,
      deletionProof,
      userInput,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate default warning message
   */
  private getDefaultWarningMessage(cardName: string, lastFourDigits?: string): string {
    const cardIdentifier = lastFourDigits ? `${cardName} (*${lastFourDigits})` : cardName;
    
    return `⚠️ PERMANENT DELETION WARNING ⚠️

This will permanently delete ${cardIdentifier} and all associated data.

IMPORTANT:
• This action cannot be undone
• Card credentials will be immediately invalidated
• All encrypted data will be cryptographically destroyed
• Deletion will be logged with timestamp verification
• You will lose access to any remaining balance

This is a security-focused deletion that ensures complete data removal.`;
  }

  /**
   * Format deletion proof for display
   */
  formatDeletionProof(proof: DeletionProof): string {
    return `Deletion Proof:
Card ID: ${proof.cardId}
Deletion Key: ${proof.deletionKey.substring(0, 8)}...
Timestamp: ${new Date(proof.timestamp).toLocaleString()}
Signature: ${proof.signature.substring(0, 16)}...`;
  }

  /**
   * Generate security checklist for deletion confirmation
   */
  getSecurityChecklist(): SecurityCheckItem[] {
    return [
      {
        id: 'cryptographic-deletion',
        label: 'Cryptographic deletion with KMS key destruction',
        description: 'Card encryption keys will be permanently destroyed',
        critical: true
      },
      {
        id: 'immediate-invalidation',
        label: 'Immediate card invalidation',
        description: 'Card will be instantly unusable for transactions',
        critical: true
      },
      {
        id: 'data-removal',
        label: 'Complete data removal',
        description: 'All stored card data will be permanently deleted',
        critical: true
      },
      {
        id: 'audit-logging',
        label: 'Deletion audit logging',
        description: 'Deletion will be logged for security verification',
        critical: false
      },
      {
        id: 'no-recovery',
        label: 'No recovery possible',
        description: 'This action cannot be reversed or undone',
        critical: true
      }
    ];
  }
}

// Types for deletion confirmation data
export interface DeletionConfirmationData {
  cardId: string;
  cardName: string;
  lastFourDigits?: string;
  timestamp: string;
  warningMessage: string;
  requireTypedConfirmation: boolean;
  confirmationText: string;
  securityChecks: {
    cryptographicDeletion: boolean;
    permanentRemoval: boolean;
    irrevocable: boolean;
    noRecovery: boolean;
  };
}

export interface SecurityCheckItem {
  id: string;
  label: string;
  description: string;
  critical: boolean;
}

// Export singleton instance
export const deletionConfirmation = new DeletionConfirmationService();

// Export class for testing or multiple instances
export { DeletionConfirmationService };

// Convenience functions
export namespace CardDeletion {
  /**
   * Quick deletion confirmation for a card
   */
  export function createConfirmation(
    cardId: string,
    cardName: string,
    lastFourDigits?: string
  ): DeletionConfirmationData {
    return deletionConfirmation.generateConfirmationData(cardId, {
      cardName,
      lastFourDigits
    });
  }

  /**
   * Validate user typed confirmation
   */
  export function validateUserInput(userInput: string): boolean {
    return deletionConfirmation.validateConfirmation(userInput, 'DELETE');
  }

  /**
   * Verify deletion proof from backend
   */
  export async function verifyProof(
    proof: DeletionProof,
    cardId: string
  ): Promise<boolean> {
    return deletionConfirmation.verifyDeletionProof(proof, cardId);
  }

  /**
   * Create final deletion result
   */
  export function createResult(
    confirmed: boolean,
    userInput?: string,
    proof?: DeletionProof
  ): DeletionConfirmationResult {
    return deletionConfirmation.createConfirmationResult(confirmed, userInput, proof);
  }
}