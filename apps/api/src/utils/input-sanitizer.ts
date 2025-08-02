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
}