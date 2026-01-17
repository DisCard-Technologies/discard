/**
 * Convex Test Helpers
 *
 * Utilities for testing Convex queries, mutations, and actions.
 */

import {
  mockUseQuery,
  mockUseMutation,
  mockUseAction,
  setMockQueryResult,
  clearMockQueryResults,
  addMockUser,
  addMockCard,
  addMockIntent,
  getMockDataStore,
  clearMockDataStore,
  resetConvexMocks,
} from '../mocks/convex';

// Re-export mocks for convenience
export {
  mockUseQuery,
  mockUseMutation,
  mockUseAction,
  setMockQueryResult,
  clearMockQueryResults,
  addMockUser,
  addMockCard,
  addMockIntent,
  getMockDataStore,
  clearMockDataStore,
  resetConvexMocks,
};

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Mock a Convex query to return specific data
 *
 * @example
 * ```ts
 * mockQuery('cards.cards.list', { cards: [testCard1, testCard2] });
 * ```
 */
export function mockQuery<T>(queryPath: string, result: T): void {
  setMockQueryResult(queryPath, result);
}

/**
 * Mock a Convex query to return loading state
 */
export function mockQueryLoading(queryPath: string): void {
  setMockQueryResult(queryPath, undefined);
}

/**
 * Mock a Convex query to return an error
 */
export function mockQueryError(queryPath: string, error: Error): void {
  mockUseQuery.mockImplementationOnce((query: any, args: any) => {
    if (args === 'skip') return undefined;
    throw error;
  });
}

// ============================================================================
// Mutation Helpers
// ============================================================================

/**
 * Mock a Convex mutation to return specific result
 *
 * @example
 * ```ts
 * const { mutationFn, calls } = mockMutation();
 * mutationFn({ cardId: 'card_001' });
 * expect(calls).toHaveLength(1);
 * ```
 */
export function mockMutation<TResult = any>(result?: TResult): {
  mutationFn: jest.Mock;
  calls: any[];
} {
  const calls: any[] = [];
  const mutationFn = jest.fn(async (args: any) => {
    calls.push(args);
    return result ?? `mock_result_${Date.now()}`;
  });

  mockUseMutation.mockReturnValueOnce(mutationFn);

  return { mutationFn, calls };
}

/**
 * Mock a mutation to fail with specific error
 */
export function mockMutationError(error: Error | string): jest.Mock {
  const errorObj = typeof error === 'string' ? new Error(error) : error;
  const mutationFn = jest.fn().mockRejectedValue(errorObj);
  mockUseMutation.mockReturnValueOnce(mutationFn);
  return mutationFn;
}

/**
 * Mock a mutation to simulate network delay
 */
export function mockMutationDelayed<TResult = any>(
  result: TResult,
  delayMs: number = 100
): jest.Mock {
  const mutationFn = jest.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return result;
  });
  mockUseMutation.mockReturnValueOnce(mutationFn);
  return mutationFn;
}

// ============================================================================
// Action Helpers
// ============================================================================

/**
 * Mock a Convex action to return specific result
 */
export function mockAction<TResult = any>(result?: TResult): {
  actionFn: jest.Mock;
  calls: any[];
} {
  const calls: any[] = [];
  const actionFn = jest.fn(async (args: any) => {
    calls.push(args);
    return result ?? { success: true };
  });

  mockUseAction.mockReturnValueOnce(actionFn);

  return { actionFn, calls };
}

/**
 * Mock an action to fail with specific error
 */
export function mockActionError(error: Error | string): jest.Mock {
  const errorObj = typeof error === 'string' ? new Error(error) : error;
  const actionFn = jest.fn().mockRejectedValue(errorObj);
  mockUseAction.mockReturnValueOnce(actionFn);
  return actionFn;
}

// ============================================================================
// Data Setup Helpers
// ============================================================================

/**
 * Set up a complete test environment with user, cards, and intents
 */
export function setupTestEnvironment(config: {
  user?: any;
  cards?: any[];
  intents?: any[];
  contacts?: any[];
}): {
  userId: string;
  cardIds: string[];
  intentIds: string[];
} {
  clearMockDataStore();

  let userId = 'test_user_001';

  if (config.user) {
    userId = addMockUser(config.user);
  }

  const cardIds: string[] = [];
  if (config.cards) {
    config.cards.forEach((card) => {
      const id = addMockCard({ ...card, userId });
      cardIds.push(id);
    });
  }

  const intentIds: string[] = [];
  if (config.intents) {
    config.intents.forEach((intent) => {
      const id = addMockIntent({ ...intent, userId });
      intentIds.push(id);
    });
  }

  return { userId, cardIds, intentIds };
}

// ============================================================================
// Subscription Helpers
// ============================================================================

/**
 * Simulate real-time data update
 * This triggers a re-render with new query data
 */
export function simulateRealtimeUpdate(queryPath: string, newData: any): void {
  setMockQueryResult(queryPath, newData);
  // In a real implementation, this would trigger a React re-render
  // For testing, we rely on the component re-rendering on state changes
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a mutation was called with specific arguments
 */
export function expectMutationCalledWith(
  mutationFn: jest.Mock,
  expectedArgs: Record<string, any>
): void {
  expect(mutationFn).toHaveBeenCalled();
  const lastCall = mutationFn.mock.calls[mutationFn.mock.calls.length - 1][0];
  expect(lastCall).toMatchObject(expectedArgs);
}

/**
 * Assert that a query was skipped (returned undefined due to skip args)
 */
export function expectQuerySkipped(result: any): void {
  expect(result).toBeUndefined();
}
