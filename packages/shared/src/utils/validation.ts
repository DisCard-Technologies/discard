/**
 * Funding-specific validation helpers
 */

/**
 * Validate Stripe payment method ID format
 */
export function validateStripePaymentMethodId(paymentMethodId: string): { isValid: boolean; error?: string } {
  if (!paymentMethodId || typeof paymentMethodId !== 'string') {
    return { isValid: false, error: 'Payment method ID is required' };
  }
  
  // Stripe payment method IDs start with pm_
  if (!paymentMethodId.startsWith('pm_')) {
    return { isValid: false, error: 'Invalid payment method ID format' };
  }
  
  // Basic length check (Stripe IDs are typically 24-27 characters)
  if (paymentMethodId.length < 20 || paymentMethodId.length > 30) {
    return { isValid: false, error: 'Invalid payment method ID length' };
  }
  
  return { isValid: true };
}

/**
 * Validate currency code (ISO 4217)
 */
export function validateCurrency(currency: string): { isValid: boolean; error?: string } {
  if (!currency || typeof currency !== 'string') {
    return { isValid: false, error: 'Currency is required' };
  }
  
  const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD']; // Add more as needed
  if (!validCurrencies.includes(currency.toUpperCase())) {
    return { isValid: false, error: `Unsupported currency: ${currency}` };
  }
  
  return { isValid: true };
}

/**
 * Validate email format for notifications
 */
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }
  
  return { isValid: true };
}

/**
 * Validate notification threshold values
 */
export function validateNotificationThreshold(threshold: number): { isValid: boolean; error?: string } {
  if (!Number.isInteger(threshold) || threshold < 0) {
    return { isValid: false, error: 'Threshold must be a non-negative integer in cents' };
  }
  
  // Maximum threshold of $1000
  if (threshold > 100000) {
    return { isValid: false, error: 'Threshold cannot exceed $1000.00' };
  }
  
  return { isValid: true };
}