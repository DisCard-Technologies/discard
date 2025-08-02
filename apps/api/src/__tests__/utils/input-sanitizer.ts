/**
 * Input sanitization utilities for tests
 */
export class InputSanitizer {
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

  static sanitizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      return '';
    }
    
    return email.toLowerCase().trim().substring(0, 255);
  }

  static sanitizeNumber(input: any): number | null {
    const num = Number(input);
    return isNaN(num) ? null : num;
  }

  static sanitizeAuthInputs(data: { email?: string; username?: string }) {
    return {
      email: data.email ? this.sanitizeEmail(data.email) : undefined,
      username: data.username ? this.sanitizeString(data.username) : undefined
    };
  }
}