/**
 * Convex Client Mock
 *
 * Mocks Convex hooks and client for testing without a real backend.
 */

import type { Id } from '@/convex/_generated/dataModel';

// ============================================================================
// Mock Data Store
// ============================================================================

interface MockDataStore {
  users: Map<string, any>;
  cards: Map<string, any>;
  intents: Map<string, any>;
  transfers: Map<string, any>;
  contacts: Map<string, any>;
}

const mockDataStore: MockDataStore = {
  users: new Map(),
  cards: new Map(),
  intents: new Map(),
  transfers: new Map(),
  contacts: new Map(),
};

// ============================================================================
// Mock Query Results
// ============================================================================

const mockQueryResults = new Map<string, any>();

// ============================================================================
// Mock Hooks
// ============================================================================

export const mockUseQuery = jest.fn((queryFn: any, args?: any) => {
  if (args === 'skip') return undefined;

  // Return mock data based on query path
  const queryPath = queryFn?.toString?.() || '';

  if (mockQueryResults.has(queryPath)) {
    return mockQueryResults.get(queryPath);
  }

  // Default empty results
  return undefined;
});

export const mockUseMutation = jest.fn((mutationFn: any) => {
  return jest.fn(async (args: any) => {
    // Return a mock ID for create operations
    return `mock_id_${Date.now()}` as Id<any>;
  });
});

export const mockUseAction = jest.fn((actionFn: any) => {
  return jest.fn(async (args: any) => {
    return { success: true };
  });
});

export const mockUseConvex = jest.fn(() => ({
  query: mockUseQuery,
  mutation: mockUseMutation,
  action: mockUseAction,
}));

// ============================================================================
// Mock API Object
// ============================================================================

export const mockApi = {
  cards: {
    cards: {
      list: 'cards.cards.list',
      get: 'cards.cards.get',
      create: 'cards.cards.create',
      freeze: 'cards.cards.freeze',
      unfreeze: 'cards.cards.unfreeze',
      updateStatus: 'cards.cards.updateStatus',
      deleteCard: 'cards.cards.deleteCard',
      getAuthorizations: 'cards.cards.getAuthorizations',
    },
  },
  intents: {
    intents: {
      list: 'intents.intents.list',
      get: 'intents.intents.get',
      create: 'intents.intents.create',
      clarify: 'intents.intents.clarify',
      approve: 'intents.intents.approve',
      cancel: 'intents.intents.cancel',
    },
  },
  transfers: {
    transfers: {
      create: 'transfers.transfers.create',
      updateStatus: 'transfers.transfers.updateStatus',
      list: 'transfers.transfers.list',
      get: 'transfers.transfers.get',
    },
    contacts: {
      list: 'transfers.contacts.list',
      get: 'transfers.contacts.get',
      create: 'transfers.contacts.create',
      markUsed: 'transfers.contacts.markUsed',
    },
  },
  users: {
    users: {
      get: 'users.users.get',
      create: 'users.users.create',
      update: 'users.users.update',
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Set mock query result for a specific query path
 */
export const setMockQueryResult = (queryPath: string, result: any) => {
  mockQueryResults.set(queryPath, result);
};

/**
 * Clear all mock query results
 */
export const clearMockQueryResults = () => {
  mockQueryResults.clear();
};

/**
 * Add mock user to data store
 */
export const addMockUser = (user: any) => {
  const id = user._id || `user_${Date.now()}`;
  mockDataStore.users.set(id, { ...user, _id: id });
  return id;
};

/**
 * Add mock card to data store
 */
export const addMockCard = (card: any) => {
  const id = card._id || `card_${Date.now()}`;
  mockDataStore.cards.set(id, { ...card, _id: id });
  return id;
};

/**
 * Add mock intent to data store
 */
export const addMockIntent = (intent: any) => {
  const id = intent._id || `intent_${Date.now()}`;
  mockDataStore.intents.set(id, { ...intent, _id: id });
  return id;
};

/**
 * Get mock data store for assertions
 */
export const getMockDataStore = () => mockDataStore;

/**
 * Clear mock data store
 */
export const clearMockDataStore = () => {
  mockDataStore.users.clear();
  mockDataStore.cards.clear();
  mockDataStore.intents.clear();
  mockDataStore.transfers.clear();
  mockDataStore.contacts.clear();
};

/**
 * Reset all Convex mocks
 */
export const resetConvexMocks = () => {
  clearMockQueryResults();
  clearMockDataStore();
  mockUseQuery.mockClear();
  mockUseMutation.mockClear();
  mockUseAction.mockClear();
};

// ============================================================================
// Jest Mocks
// ============================================================================

jest.mock('convex/react', () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useAction: mockUseAction,
  useConvex: mockUseConvex,
  ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: mockApi,
}));
