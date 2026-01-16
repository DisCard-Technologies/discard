/**
 * Marqeta Card Provider
 *
 * Implements CardProvider interface for Marqeta card issuing.
 * Features:
 * - KYC required
 * - JIT (Just-In-Time) funding model
 * - Real-time authorization
 * - Reloadable cards
 *
 * This is a client-side wrapper. Actual API calls go through Convex actions
 * in convex/cards/marqeta.ts for security.
 */

import type {
  CardProvider,
  CardOptions,
  CardResult,
  CardDetails,
  AuthorizationRequest,
  AuthorizationResponse,
} from './types';

// Marqeta API configuration
const MARQETA_BASE_URL = process.env.MARQETA_BASE_URL ?? 'https://sandbox-api.marqeta.com/v3';
const MARQETA_APP_TOKEN = process.env.MARQETA_APPLICATION_TOKEN ?? process.env.MARQETA_APP_TOKEN;
const MARQETA_ADMIN_TOKEN = process.env.MARQETA_ACCESS_TOKEN ?? process.env.MARQETA_ADMIN_TOKEN;
const MARQETA_CARD_PRODUCT_TOKEN = process.env.MARQETA_CARD_PRODUCT_TOKEN;

/**
 * Get authorization header for Marqeta API
 */
function getAuthHeader(): string {
  if (!MARQETA_APP_TOKEN || !MARQETA_ADMIN_TOKEN) {
    throw new Error('Marqeta credentials not configured');
  }
  return 'Basic ' + Buffer.from(`${MARQETA_APP_TOKEN}:${MARQETA_ADMIN_TOKEN}`).toString('base64');
}

/**
 * Make authenticated request to Marqeta API
 */
async function marqetaRequest<T>(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${MARQETA_BASE_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Marqeta API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<T>;
}

export class MarqetaProvider implements CardProvider {
  readonly name = 'marqeta' as const;
  readonly requiresKyc = true;
  readonly fundingModel = 'jit' as const;

  /**
   * Create a new Marqeta card
   * Note: This is typically called from Convex actions for security
   */
  async createCard(userId: string, options: CardOptions): Promise<CardResult> {
    // Step 1: Create or get Marqeta user
    const marqetaUser = await this.createOrGetUser(userId, options);

    // Step 2: Create virtual card
    const cardResponse = await marqetaRequest<{
      token: string;
      pan: string;
      expiration: string;
      expiration_time: string;
    }>('POST', '/cards', {
      card_product_token: MARQETA_CARD_PRODUCT_TOKEN,
      user_token: marqetaUser.token,
    });

    // Step 3: Get card details
    const cardDetails = await this.getCardDetails(cardResponse.token);

    // Parse expiration
    const [expMonth, expYear] = cardResponse.expiration.split('/').map(Number);

    return {
      providerCardToken: cardResponse.token,
      providerUserToken: marqetaUser.token,
      last4: cardDetails.pan.slice(-4),
      expirationMonth: expMonth,
      expirationYear: 2000 + expYear,
    };
  }

  /**
   * Create or get existing Marqeta user
   */
  private async createOrGetUser(
    userId: string,
    options: CardOptions
  ): Promise<{ token: string }> {
    // Check if user exists by looking up by external reference
    try {
      const existingUser = await marqetaRequest<{ token: string }>(
        'GET',
        `/users/${userId}`
      );
      return existingUser;
    } catch {
      // User doesn't exist, create new one
      const newUser = await marqetaRequest<{ token: string }>('POST', '/users', {
        token: userId,
        first_name: options.displayName || 'Card',
        last_name: 'User',
        email: options.email,
        active: true,
      });
      return newUser;
    }
  }

  /**
   * Activate a card
   */
  async activateCard(cardToken: string): Promise<void> {
    await marqetaRequest('PUT', `/cards/${cardToken}/transitions`, {
      card_token: cardToken,
      state: 'ACTIVE',
      reason_code: '00',
      channel: 'API',
    });
  }

  /**
   * Freeze a card
   */
  async freezeCard(cardToken: string): Promise<void> {
    await marqetaRequest('PUT', `/cards/${cardToken}/transitions`, {
      card_token: cardToken,
      state: 'SUSPENDED',
      reason_code: '01',
      channel: 'API',
    });
  }

  /**
   * Unfreeze a card
   */
  async unfreezeCard(cardToken: string): Promise<void> {
    await marqetaRequest('PUT', `/cards/${cardToken}/transitions`, {
      card_token: cardToken,
      state: 'ACTIVE',
      reason_code: '00',
      channel: 'API',
    });
  }

  /**
   * Close a card permanently
   */
  async closeCard(cardToken: string): Promise<void> {
    await marqetaRequest('PUT', `/cards/${cardToken}/transitions`, {
      card_token: cardToken,
      state: 'TERMINATED',
      reason_code: '03',
      channel: 'API',
    });
  }

  /**
   * Get sensitive card details (PAN, CVV)
   */
  async getCardDetails(cardToken: string): Promise<CardDetails> {
    // Get PAN
    const panResponse = await marqetaRequest<{
      pan: string;
      expiration: string;
      cvv_number: string;
    }>('GET', `/cards/${cardToken}/showpan`);

    // Parse expiration
    const [expMonth, expYear] = panResponse.expiration.split('/').map(Number);

    return {
      pan: panResponse.pan,
      cvv: panResponse.cvv_number,
      expirationMonth: expMonth,
      expirationYear: 2000 + expYear,
    };
  }

  /**
   * Process authorization (JIT funding)
   * This is called from the webhook handler in Convex
   *
   * Note: The actual implementation is in convex/cards/marqeta.ts
   * This method is here for interface compliance and can be used
   * for testing or direct API access scenarios.
   */
  async processAuthorization(
    request: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
    // JIT authorization is handled by the Convex action (convex/cards/marqeta.ts)
    // which has access to the database for balance checks
    throw new Error(
      'JIT authorization should be processed through Convex actions. ' +
        'Use convex/cards/marqeta:processAuthorization instead.'
    );
  }
}
