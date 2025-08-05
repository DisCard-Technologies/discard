import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { stripeService } from '../../../services/funding/stripe.service';
import Stripe from 'stripe';
import { 
  StripePaymentIntent, 
  StripeCustomer, 
  StripePaymentMethod,
  StripeFraudCheck 
} from '@discard/shared/src/types/stripe';
import { STRIPE_CONSTANTS } from '@discard/shared/src/constants/stripe';

// Mock Stripe
jest.mock('stripe');

const MockedStripe = Stripe as jest.MockedClass<typeof Stripe>;

describe('StripeService', () => {
  let mockStripe: jest.Mocked<Stripe>;
  const mockUserId = 'test-user-id';
  const mockCustomerId = 'cus_1234567890abcdef';
  const mockPaymentMethodId = 'pm_1234567890abcdef';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set environment variables before any imports
    process.env.STRIPE_SECRET_KEY = 'sk_test_1234567890abcdef';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_1234567890abcdef';
    process.env.APP_BASE_URL = 'https://discard.app';
    
    // Mock Stripe constructor and methods
    mockStripe = {
      customers: {
        create: jest.fn(),
      },
      paymentIntents: {
        create: jest.fn(),
        confirm: jest.fn(),
        retrieve: jest.fn(),
      },
      paymentMethods: {
        attach: jest.fn(),
        list: jest.fn(),
        retrieve: jest.fn(),
      },
      webhooks: {
        constructEvent: jest.fn(),
      },
    } as any;

    MockedStripe.mockImplementation(() => mockStripe);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    test('should initialize Stripe with correct configuration', () => {
      // Act
      const service = new (require('../../../services/funding/stripe.service').StripeService)();

      // Assert
      expect(MockedStripe).toHaveBeenCalledWith('sk_test_1234567890abcdef', {
        apiVersion: STRIPE_CONSTANTS.API_VERSION,
        typescript: true,
      });
    });

    test('should throw error if STRIPE_SECRET_KEY is missing', () => {
      // Arrange
      delete process.env.STRIPE_SECRET_KEY;

      // Act & Assert
      expect(() => {
        new (require('../../../services/funding/stripe.service').StripeService)();
      }).toThrow('STRIPE_SECRET_KEY environment variable is required');
    });
  });

  describe('createCustomer', () => {
    test('should create Stripe customer successfully', async () => {
      // Arrange
      const mockStripeCustomer = {
        id: mockCustomerId,
        email: 'test@example.com',
        created: 1640995200, // 2022-01-01T00:00:00Z
        metadata: { userId: mockUserId }
      };

      mockStripe.customers.create.mockResolvedValue(mockStripeCustomer as any);

      // Act
      const result = await stripeService.createCustomer(mockUserId, 'test@example.com');

      // Assert
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        metadata: { userId: mockUserId }
      });

      expect(result).toEqual({
        id: mockCustomerId,
        userId: mockUserId,
        email: 'test@example.com',
        created: '2022-01-01T00:00:00.000Z'
      });
    });

    test('should handle Stripe customer creation error', async () => {
      // Arrange
      mockStripe.customers.create.mockRejectedValue(new Error('Stripe API error'));

      // Act & Assert
      await expect(stripeService.createCustomer(mockUserId, 'test@example.com'))
        .rejects.toThrow('Failed to create Stripe customer');
    });
  });

  describe('createPaymentIntent', () => {
    test('should create payment intent successfully for card payment', async () => {
      // Arrange
      const mockPaymentIntent = {
        id: 'pi_1234567890abcdef',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
        payment_method: mockPaymentMethodId,
        client_secret: 'pi_1234567890abcdef_secret_123',
        created: 1640995200,
        confirmation_method: 'manual',
        confirm: true
      };

      const mockPaymentMethod = {
        id: mockPaymentMethodId,
        type: 'card',
        created: 1640995200
      };

      mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent as any);
      mockStripe.paymentMethods.retrieve.mockResolvedValue(mockPaymentMethod as any);

      // Act
      const result = await stripeService.createPaymentIntent(
        10000,
        'USD',
        mockPaymentMethodId,
        mockCustomerId,
        { userId: mockUserId, type: 'account_funding' }
      );

      // Assert
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 10000,
        currency: 'usd',
        payment_method: mockPaymentMethodId,
        customer: mockCustomerId,
        confirmation_method: 'manual',
        confirm: true,
        metadata: {
          userId: mockUserId,
          type: 'account_funding',
          source: 'discard_funding'
        },
        return_url: 'https://discard.app/dashboard/funding'
      });

      expect(result).toEqual({
        id: 'pi_1234567890abcdef',
        amount: 10000,
        currency: 'USD',
        status: 'succeeded',
        paymentMethodId: mockPaymentMethodId,
        clientSecret: 'pi_1234567890abcdef_secret_123',
        estimatedProcessingTime: STRIPE_CONSTANTS.PROCESSING_TIMES.CARD,
        created: '2022-01-01T00:00:00.000Z'
      });
    });

    test('should handle ACH payment with longer processing time', async () => {
      // Arrange
      const mockPaymentIntent = {
        id: 'pi_ach_1234567890',
        amount: 50000,
        currency: 'usd',
        status: 'processing',
        payment_method: 'pm_ach_1234567890',
        client_secret: 'pi_ach_secret_123',
        created: 1640995200
      };

      const mockPaymentMethod = {
        id: 'pm_ach_1234567890',
        type: 'us_bank_account',
        created: 1640995200
      };

      mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent as any);
      mockStripe.paymentMethods.retrieve.mockResolvedValue(mockPaymentMethod as any);

      // Act
      const result = await stripeService.createPaymentIntent(
        50000,
        'USD',
        'pm_ach_1234567890',
        mockCustomerId
      );

      // Assert
      expect(result.estimatedProcessingTime).toBe(STRIPE_CONSTANTS.PROCESSING_TIMES.ACH_DEBIT);
      expect(result.status).toBe('processing');
    });

    test('should handle Stripe card error', async () => {
      // Arrange
      const cardError = new Stripe.errors.StripeCardError({
        type: 'card_error',
        code: 'card_declined',
        decline_code: 'insufficient_funds',
        message: 'Your card was declined.'
      } as any);

      mockStripe.paymentIntents.create.mockRejectedValue(cardError);

      // Act & Assert
      await expect(stripeService.createPaymentIntent(10000, 'USD', mockPaymentMethodId, mockCustomerId))
        .rejects.toThrow('Card was declined: insufficient_funds');
    });

    test('should handle Stripe rate limit error', async () => {
      // Arrange
      const rateLimitError = new Stripe.errors.StripeRateLimitError({
        type: 'rate_limit_error',
        message: 'Too many requests'
      } as any);

      mockStripe.paymentIntents.create.mockRejectedValue(rateLimitError);

      // Act & Assert
      await expect(stripeService.createPaymentIntent(10000, 'USD', mockPaymentMethodId, mockCustomerId))
        .rejects.toThrow('Too many payment requests, please try again later');
    });

    test('should handle generic Stripe API error', async () => {
      // Arrange
      const apiError = new Stripe.errors.StripeAPIError({
        type: 'api_error',
        message: 'Internal server error'
      } as any);

      mockStripe.paymentIntents.create.mockRejectedValue(apiError);

      // Act & Assert
      await expect(stripeService.createPaymentIntent(10000, 'USD', mockPaymentMethodId, mockCustomerId))
        .rejects.toThrow('Payment service temporarily unavailable, please try again');
    });
  });

  describe('confirmPaymentIntent', () => {
    test('should confirm payment intent successfully', async () => {
      // Arrange
      const mockPaymentIntent = {
        id: 'pi_1234567890abcdef',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
        payment_method: mockPaymentMethodId,
        client_secret: 'pi_1234567890abcdef_secret_123',
        created: 1640995200
      };

      const mockPaymentMethod = {
        id: mockPaymentMethodId,
        type: 'card',
        created: 1640995200
      };

      mockStripe.paymentIntents.confirm.mockResolvedValue(mockPaymentIntent as any);
      mockStripe.paymentMethods.retrieve.mockResolvedValue(mockPaymentMethod as any);

      // Act
      const result = await stripeService.confirmPaymentIntent('pi_1234567890abcdef');

      // Assert
      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith('pi_1234567890abcdef');
      expect(result.status).toBe('succeeded');
    });
  });

  describe('getPaymentIntent', () => {
    test('should retrieve payment intent successfully', async () => {
      // Arrange
      const mockPaymentIntent = {
        id: 'pi_1234567890abcdef',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
        payment_method: mockPaymentMethodId,
        client_secret: 'pi_1234567890abcdef_secret_123',
        created: 1640995200
      };

      const mockPaymentMethod = {
        id: mockPaymentMethodId,
        type: 'card',
        created: 1640995200
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent as any);
      mockStripe.paymentMethods.retrieve.mockResolvedValue(mockPaymentMethod as any);

      // Act
      const result = await stripeService.getPaymentIntent('pi_1234567890abcdef');

      // Assert
      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_1234567890abcdef');
      expect(result.id).toBe('pi_1234567890abcdef');
    });
  });

  describe('attachPaymentMethod', () => {
    test('should attach payment method to customer successfully', async () => {
      // Arrange
      const mockPaymentMethod = {
        id: mockPaymentMethodId,
        type: 'card',
        created: 1640995200,
        card: {
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2026,
          country: 'US'
        }
      };

      mockStripe.paymentMethods.attach.mockResolvedValue(mockPaymentMethod as any);

      // Act
      const result = await stripeService.attachPaymentMethod(mockPaymentMethodId, mockCustomerId);

      // Assert
      expect(mockStripe.paymentMethods.attach).toHaveBeenCalledWith(mockPaymentMethodId, {
        customer: mockCustomerId
      });

      expect(result).toEqual(expect.objectContaining({
        id: mockPaymentMethodId,
        type: 'card',
        card: expect.objectContaining({
          brand: 'visa',
          last4: '4242'
        })
      }));
    });
  });

  describe('listPaymentMethods', () => {
    test('should list customer payment methods successfully', async () => {
      // Arrange
      const mockPaymentMethods = {
        data: [
          {
            id: 'pm_card_1',
            type: 'card',
            created: 1640995200,
            card: {
              brand: 'visa',
              last4: '4242',
              exp_month: 12,
              exp_year: 2026,
              country: 'US'
            }
          },
          {
            id: 'pm_card_2',
            type: 'card',
            created: 1640995100,
            card: {
              brand: 'mastercard',
              last4: '8888',
              exp_month: 6,
              exp_year: 2025,
              country: 'US'
            }
          }
        ]
      };

      mockStripe.paymentMethods.list.mockResolvedValue(mockPaymentMethods as any);

      // Act
      const result = await stripeService.listPaymentMethods(mockCustomerId);

      // Assert
      expect(mockStripe.paymentMethods.list).toHaveBeenCalledWith({
        customer: mockCustomerId,
        type: 'card'
      });

      expect(result).toHaveLength(2);
      expect(result[0].card?.brand).toBe('visa');
      expect(result[1].card?.brand).toBe('mastercard');
    });
  });

  describe('performFraudCheck', () => {
    test('should perform fraud check and return low risk', async () => {
      // Arrange
      const mockPaymentIntent = {
        id: 'pi_1234567890abcdef',
        latest_charge: {
          id: 'ch_1234567890abcdef',
          outcome: {
            risk_level: 'normal',
            risk_score: 32
          },
          payment_method_details: {
            card: {
              checks: {
                cvc_check: 'pass',
                address_line1_check: 'pass',
                address_postal_code_check: 'pass'
              }
            }
          }
        }
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent as any);

      // Act
      const result = await stripeService.performFraudCheck('pi_1234567890abcdef');

      // Assert
      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_1234567890abcdef', {
        expand: ['latest_charge.outcome']
      });

      expect(result).toEqual({
        riskLevel: 'low',
        riskScore: 25,
        checks: {
          cvc_check: 'pass',
          address_line1_check: 'pass',
          address_postal_code_check: 'pass'
        },
        recommendations: []
      });
    });

    test('should identify high risk payment', async () => {
      // Arrange
      const mockPaymentIntent = {
        id: 'pi_high_risk',
        latest_charge: {
          id: 'ch_high_risk',
          outcome: {
            risk_level: 'high',
            risk_score: 90
          },
          payment_method_details: {
            card: {
              checks: {
                cvc_check: 'fail',
                address_line1_check: 'fail',
                address_postal_code_check: 'unavailable'
              }
            }
          }
        }
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent as any);

      // Act
      const result = await stripeService.performFraudCheck('pi_high_risk');

      // Assert
      expect(result.riskLevel).toBe('high');
      expect(result.riskScore).toBe(85);
      expect(result.recommendations).toContain('Consider additional verification');
      expect(result.recommendations).toContain('Monitor transaction closely');
    });

    test('should handle payment intent with no charge', async () => {
      // Arrange
      const mockPaymentIntent = {
        id: 'pi_no_charge',
        latest_charge: null
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent as any);

      // Act
      const result = await stripeService.performFraudCheck('pi_no_charge');

      // Assert
      expect(result).toEqual({
        riskLevel: 'low',
        riskScore: 0,
        checks: {
          cvc_check: 'unavailable',
          address_line1_check: 'unavailable',
          address_postal_code_check: 'unavailable'
        },
        recommendations: []
      });
    });
  });

  describe('validateWebhookSignature', () => {
    test('should validate webhook signature successfully', () => {
      // Arrange
      const mockEvent = {
        id: 'evt_1234567890',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test' } }
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent as any);

      // Act
      const result = stripeService.validateWebhookSignature(
        '{"id":"evt_1234567890"}',
        't=1640995200,v1=signature'
      );

      // Assert
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        '{"id":"evt_1234567890"}',
        't=1640995200,v1=signature',
        'whsec_1234567890abcdef'
      );

      expect(result).toEqual(mockEvent);
    });

    test('should throw error for invalid signature', () => {
      // Arrange
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      // Act & Assert
      expect(() => {
        stripeService.validateWebhookSignature('payload', 'invalid_signature');
      }).toThrow('Invalid webhook signature');
    });

    test('should throw error if webhook secret is missing', () => {
      // Arrange
      delete process.env.STRIPE_WEBHOOK_SECRET;

      // Act & Assert
      expect(() => {
        stripeService.validateWebhookSignature('payload', 'signature');
      }).toThrow('STRIPE_WEBHOOK_SECRET environment variable is required');
    });
  });

  describe('error handling', () => {
    test('should handle various card error codes', async () => {
      const errorCodes = [
        { code: 'insufficient_funds', expectedMessage: 'Insufficient funds on payment method' },
        { code: 'expired_card', expectedMessage: 'Payment method has expired' },
        { code: 'incorrect_cvc', expectedMessage: 'Incorrect security code (CVC)' },
        { code: 'processing_error', expectedMessage: 'Payment processing error, please try again' },
        { code: 'incorrect_number', expectedMessage: 'Invalid card number' }
      ];

      for (const { code, expectedMessage } of errorCodes) {
        const cardError = new Stripe.errors.StripeCardError({
          type: 'card_error',
          code: code as any,
          message: `Card error: ${code}`
        } as any);

        mockStripe.paymentIntents.create.mockRejectedValue(cardError);

        await expect(stripeService.createPaymentIntent(10000, 'USD', mockPaymentMethodId, mockCustomerId))
          .rejects.toThrow(expectedMessage);
      }
    });

    test('should handle connection error', async () => {
      // Arrange
      const connectionError = new Stripe.errors.StripeConnectionError({
        type: 'connection_error',
        message: 'Network error'
      } as any);

      mockStripe.paymentIntents.create.mockRejectedValue(connectionError);

      // Act & Assert
      await expect(stripeService.createPaymentIntent(10000, 'USD', mockPaymentMethodId, mockCustomerId))
        .rejects.toThrow('Network error, please check your connection and try again');
    });

    test('should handle authentication error', async () => {
      // Arrange
      const authError = new Stripe.errors.StripeAuthenticationError({
        type: 'authentication_error',
        message: 'Invalid API key'
      } as any);

      mockStripe.paymentIntents.create.mockRejectedValue(authError);

      // Act & Assert
      await expect(stripeService.createPaymentIntent(10000, 'USD', mockPaymentMethodId, mockCustomerId))
        .rejects.toThrow('Payment service configuration error');
    });
  });
});