/**
 * Test utilities for Mobile App
 * Provides mock data factories and testing helpers
 */

import { CardWithDetails, Card } from '../../src/stores/cards';

export interface TestCard extends CardWithDetails {
  testId?: string;
}

export const testDataFactory = {
  createCard: (overrides: Partial<TestCard> = {}): TestCard => ({
    cardId: 'test-card-id',
    status: 'active',
    spendingLimit: 10000, // $100.00 in cents
    currentBalance: 5000, // $50.00 in cents
    createdAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2026-12-31T23:59:59.999Z',
    merchantRestrictions: null,
    cardNumber: '4111111111111111',
    cvv: '123',
    isLoading: false,
    error: null,
    ...overrides,
  }),

  createActiveCard: (overrides: Partial<TestCard> = {}): TestCard =>
    testDataFactory.createCard({
      status: 'active',
      ...overrides,
    }),

  createPausedCard: (overrides: Partial<TestCard> = {}): TestCard =>
    testDataFactory.createCard({
      status: 'paused',
      ...overrides,
    }),

  createDeletedCard: (overrides: Partial<TestCard> = {}): TestCard =>
    testDataFactory.createCard({
      status: 'deleted',
      cardNumber: undefined,
      cvv: undefined,
      ...overrides,
    }),

  createLoadingCard: (overrides: Partial<TestCard> = {}): TestCard =>
    testDataFactory.createCard({
      isLoading: true,
      ...overrides,
    }),

  createCardWithError: (overrides: Partial<TestCard> = {}): TestCard =>
    testDataFactory.createCard({
      error: 'Failed to load card',
      ...overrides,
    }),

  createCardWithRestrictions: (overrides: Partial<TestCard> = {}): TestCard =>
    testDataFactory.createCard({
      merchantRestrictions: ['grocery', 'gas', 'restaurants'],
      ...overrides,
    }),
};

export const mockFunctions = {
  navigation: {
    navigate: jest.fn(),
    goBack: jest.fn(),
    dispatch: jest.fn(),
    reset: jest.fn(),
    isFocused: jest.fn(() => true),
    canGoBack: jest.fn(() => true),
  },

  cardActions: {
    onPress: jest.fn(),
    onStatusChange: jest.fn(),
    onDelete: jest.fn(),
  },

  resetMocks: () => {
    Object.values(mockFunctions.navigation).forEach(mock => mock.mockClear());
    Object.values(mockFunctions.cardActions).forEach(mock => mock.mockClear());
  },
};

// Privacy status mock data
export const mockPrivacyStatus = {
  secure: {
    privacyIsolated: true,
    encryptionActive: true,
    deletionVerifiable: true,
    status: 'secure' as const,
  },
  warning: {
    privacyIsolated: true,
    encryptionActive: false,
    deletionVerifiable: true,
    status: 'warning' as const,
  },
  error: {
    privacyIsolated: false,
    encryptionActive: false,
    deletionVerifiable: false,
    status: 'error' as const,
  },
};

// Mock Alert for testing
export const mockAlert = {
  alert: jest.fn(),
  resetMocks: () => {
    mockAlert.alert.mockClear();
  },
};

// Mock clipboard functions
export const mockClipboard = {
  copyCardNumber: jest.fn(() => Promise.resolve({ success: true, message: 'Card number copied!' })),
  copyCVV: jest.fn(() => Promise.resolve({ success: true, message: 'CVV copied!' })),
  resetMocks: () => {
    mockClipboard.copyCardNumber.mockClear();
    mockClipboard.copyCVV.mockClear();
  },
};

// Test ID helpers for components
export const getTestID = (componentName: string, element?: string) => {
  return element ? `${componentName}-${element}` : componentName;
};

// Common assertions
export const expectToBeAccessible = (component: any) => {
  expect(component).toBeOnTheScreen();
};

export const expectToHaveText = (component: any, text: string) => {
  expect(component).toHaveTextContent(text);
};

export const expectToBeDisabled = (component: any) => {
  expect(component).toBeDisabled();
};

export const expectToBeEnabled = (component: any) => {
  expect(component).not.toBeDisabled();
};

// Mock stores context
export const mockCardsContext = {
  cards: [testDataFactory.createCard()],
  loading: false,
  error: null,
  createCard: jest.fn(),
  updateCardStatus: jest.fn(),
  deleteCard: jest.fn(),
  refreshCards: jest.fn(),
  getCardDetails: jest.fn(),
  clearError: jest.fn(),
};

export const createMockCardsProvider = (overrides = {}) => ({
  ...mockCardsContext,
  ...overrides,
});

// Wait for async operations in tests
export const waitFor = (callback: () => void, timeout = 1000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkCondition = () => {
      try {
        callback();
        resolve(true);
      } catch (error) {
        if (Date.now() - startTime >= timeout) {
          reject(error);
        } else {
          setTimeout(checkCondition, 10);
        }
      }
    };
    checkCondition();
  });
};