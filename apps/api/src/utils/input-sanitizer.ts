/**
 * Input Sanitization Utilities
 * Provides secure input sanitization for user data
 */

export class InputSanitizer {
  /**
   * Sanitize string input by removing potentially harmful characters
   */
  static sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }
    
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove < and > to prevent XSS
      .replace(/['"]/g, '') // Remove quotes to prevent injection
      .replace(/--/g, '') // Remove SQL comment markers
      .replace(/DROP\s+TABLE/gi, '') // Remove DROP TABLE
      .replace(/DELETE\s+FROM/gi, '') // Remove DELETE FROM
      .replace(/UNION\s+SELECT/gi, '') // Remove UNION SELECT
      .replace(/OR\s+1\s*=\s*1/gi, '') // Remove OR 1=1 patterns
      .substring(0, 1000); // Limit length
  }

  /**
   * Sanitize email input
   */
  static sanitizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      return '';
    }
    
    return email.toLowerCase().trim().substring(0, 255);
  }

  /**
   * Sanitize numeric input
   */
  static sanitizeNumber(input: any): number | null {
    const num = Number(input);
    return isNaN(num) ? null : num;
  }

  /**
   * Sanitize card ID input
   */
  static sanitizeCardId(cardId: string): string | null {
    if (!cardId || typeof cardId !== 'string') {
      return null;
    }

    // UUID pattern validation
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sanitized = cardId.trim();
    
    return uuidPattern.test(sanitized) ? sanitized : null;
  }
}

// Export instance for convenience
export const inputSanitizer = InputSanitizer;