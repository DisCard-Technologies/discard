/**
 * Secure clipboard utility with automatic timeout and validation
 * Provides privacy-first clipboard operations for sensitive card data
 */

export interface SecureClipboardOptions {
  /** Timeout in milliseconds before clipboard is cleared (default: 30000 - 30 seconds) */
  timeout?: number;
  /** Optional callback when clipboard is cleared */
  onCleared?: () => void;
  /** Optional callback when clipboard operation fails */
  onError?: (error: Error) => void;
  /** Whether to show visual feedback (default: true) */
  showFeedback?: boolean;
}

export interface ClipboardResult {
  success: boolean;
  message: string;
  timeoutId?: NodeJS.Timeout;
}

class SecureClipboard {
  private activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Copy sensitive data to clipboard with automatic timeout clearing
   */
  async copyToClipboard(
    text: string, 
    identifier: string = 'default',
    options: SecureClipboardOptions = {}
  ): Promise<ClipboardResult> {
    const {
      timeout = 30000, // 30 seconds default
      onCleared,
      onError,
      showFeedback = true
    } = options;

    try {
      // Validate clipboard API availability
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }

      // Clear any existing timeout for this identifier
      this.clearTimeout(identifier);

      // Copy to clipboard
      await navigator.clipboard.writeText(text);

      // Set up automatic clearing
      const timeoutId = setTimeout(async () => {
        await this.clearClipboard(identifier, onCleared);
      }, timeout);

      // Store timeout reference
      this.activeTimeouts.set(identifier, timeoutId);

      const message = showFeedback 
        ? `Copied to clipboard. Will be cleared in ${timeout / 1000} seconds.`
        : 'Copied to clipboard';

      return {
        success: true,
        message,
        timeoutId
      };

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Unknown clipboard error');
      
      if (onError) {
        onError(errorObj);
      }

      return {
        success: false,
        message: `Failed to copy: ${errorObj.message}`
      };
    }
  }

  /**
   * Immediately clear clipboard and cancel timeout
   */
  async clearClipboard(identifier: string = 'default', onCleared?: () => void): Promise<void> {
    try {
      // Clear the clipboard by writing empty string
      if (navigator.clipboard) {
        await navigator.clipboard.writeText('');
      }

      // Clear timeout
      this.clearTimeout(identifier);

      if (onCleared) {
        onCleared();
      }
    } catch (error) {
      console.warn('Failed to clear clipboard:', error);
    }
  }

  /**
   * Cancel timeout without clearing clipboard
   */
  cancelTimeout(identifier: string = 'default'): void {
    this.clearTimeout(identifier);
  }

  /**
   * Clear timeout reference
   */
  private clearTimeout(identifier: string): void {
    const timeout = this.activeTimeouts.get(identifier);
    if (timeout) {
      clearTimeout(timeout);
      this.activeTimeouts.delete(identifier);
    }
  }

  /**
   * Check if clipboard contains text (read permission required)
   */
  async hasText(): Promise<boolean> {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        return false;
      }
      
      const text = await navigator.clipboard.readText();
      return text.length > 0;
    } catch {
      // Permission denied or not available
      return false;
    }
  }

  /**
   * Get all active timeout identifiers
   */
  getActiveTimeouts(): string[] {
    return Array.from(this.activeTimeouts.keys());
  }

  /**
   * Clear all active timeouts and clipboard
   */
  async clearAll(): Promise<void> {
    const identifiers = this.getActiveTimeouts();
    
    for (const identifier of identifiers) {
      await this.clearClipboard(identifier);
    }
  }
}

// Export singleton instance
export const secureClipboard = new SecureClipboard();

// Export class for testing or multiple instances
export { SecureClipboard };

// Convenience function for simple usage
export async function copySecurely(
  text: string, 
  options?: SecureClipboardOptions
): Promise<ClipboardResult> {
  return secureClipboard.copyToClipboard(text, 'default', options);
}

// Card-specific utility functions
export namespace CardClipboard {
  /**
   * Copy card number with enhanced security
   */
  export async function copyCardNumber(
    cardNumber: string,
    options?: Omit<SecureClipboardOptions, 'timeout'>
  ): Promise<ClipboardResult> {
    return secureClipboard.copyToClipboard(cardNumber, 'card-number', {
      ...options,
      timeout: 30000 // Fixed 30 second timeout for card numbers
    });
  }

  /**
   * Copy CVV with shorter timeout
   */
  export async function copyCVV(
    cvv: string,
    options?: Omit<SecureClipboardOptions, 'timeout'>
  ): Promise<ClipboardResult> {
    return secureClipboard.copyToClipboard(cvv, 'cvv', {
      ...options,
      timeout: 15000 // Shorter 15 second timeout for CVV
    });
  }

  /**
   * Copy expiration date
   */
  export async function copyExpirationDate(
    expirationDate: string,
    options?: Omit<SecureClipboardOptions, 'timeout'>
  ): Promise<ClipboardResult> {
    return secureClipboard.copyToClipboard(expirationDate, 'expiration', {
      ...options,
      timeout: 20000 // 20 second timeout for expiration
    });
  }

  /**
   * Clear all card-related clipboard data
   */
  export async function clearAllCardData(): Promise<void> {
    await Promise.all([
      secureClipboard.clearClipboard('card-number'),
      secureClipboard.clearClipboard('cvv'),
      secureClipboard.clearClipboard('expiration')
    ]);
  }
}