/**
 * Test Render Utilities
 *
 * Custom render function that wraps components with all necessary providers.
 */

import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react-native';

// ============================================================================
// Types
// ============================================================================

interface WrapperOptions {
  /** Initial authenticated user ID */
  userId?: string;
  /** Initial navigation route */
  initialRoute?: string;
  /** Initial route params */
  routeParams?: Record<string, any>;
  /** Whether to include Convex provider */
  withConvex?: boolean;
  /** Theme preference */
  theme?: 'light' | 'dark' | 'system';
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  wrapperOptions?: WrapperOptions;
}

// ============================================================================
// Mock Providers
// ============================================================================

/**
 * Mock Auth Context Provider
 */
const MockAuthProvider: React.FC<{
  userId?: string;
  children: ReactNode;
}> = ({ userId = 'test_user_001', children }) => {
  // Create mock auth context
  const authValue = {
    userId,
    isAuthenticated: !!userId,
    isLoading: false,
    login: jest.fn(),
    logout: jest.fn(),
  };

  return <>{children}</>;
};

/**
 * Mock Theme Provider
 */
const MockThemeProvider: React.FC<{
  theme?: 'light' | 'dark' | 'system';
  children: ReactNode;
}> = ({ theme = 'dark', children }) => {
  return <>{children}</>;
};

/**
 * Mock Navigation Container
 */
const MockNavigationProvider: React.FC<{
  initialRoute?: string;
  routeParams?: Record<string, any>;
  children: ReactNode;
}> = ({ children }) => {
  return <>{children}</>;
};

// ============================================================================
// All Providers Wrapper
// ============================================================================

const createAllProvidersWrapper = (options: WrapperOptions = {}) => {
  const {
    userId = 'test_user_001',
    initialRoute = 'Home',
    routeParams = {},
    theme = 'dark',
  } = options;

  const AllProviders: React.FC<{ children: ReactNode }> = ({ children }) => {
    return (
      <MockThemeProvider theme={theme}>
        <MockAuthProvider userId={userId}>
          <MockNavigationProvider
            initialRoute={initialRoute}
            routeParams={routeParams}
          >
            {children}
          </MockNavigationProvider>
        </MockAuthProvider>
      </MockThemeProvider>
    );
  };

  return AllProviders;
};

// ============================================================================
// Custom Render Function
// ============================================================================

/**
 * Custom render function that wraps component with all providers
 *
 * @example
 * ```tsx
 * const { getByText } = renderWithProviders(<MyComponent />);
 * const { getByText } = renderWithProviders(<MyComponent />, {
 *   wrapperOptions: { userId: 'custom_user' }
 * });
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): RenderResult {
  const { wrapperOptions, ...renderOptions } = options;
  const Wrapper = createAllProvidersWrapper(wrapperOptions);

  return render(ui, {
    wrapper: Wrapper,
    ...renderOptions,
  });
}

// ============================================================================
// Re-export Testing Library
// ============================================================================

// Re-export everything from testing library
export * from '@testing-library/react-native';

// Override render with our custom version as default
export { renderWithProviders as render };

// ============================================================================
// Additional Test Utilities
// ============================================================================

/**
 * Wait for async state updates
 */
export const waitForStateUpdate = async (ms: number = 0): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Create a mock event
 */
export const createMockEvent = (overrides: Record<string, any> = {}): any => ({
  preventDefault: jest.fn(),
  stopPropagation: jest.fn(),
  target: {},
  currentTarget: {},
  ...overrides,
});

/**
 * Create a mock press event for React Native
 */
export const createMockPressEvent = (): any => ({
  nativeEvent: {
    locationX: 0,
    locationY: 0,
    pageX: 0,
    pageY: 0,
    timestamp: Date.now(),
  },
  persist: jest.fn(),
});

/**
 * Create a mock change event for TextInput
 */
export const createMockChangeEvent = (text: string): any => ({
  nativeEvent: {
    text,
    eventCount: 1,
  },
});

/**
 * Create a mock keyboard event
 */
export const createMockKeyboardEvent = (key: string): any => ({
  nativeEvent: {
    key,
  },
  persist: jest.fn(),
});

// ============================================================================
// Hook Testing Utilities
// ============================================================================

/**
 * Simple hook wrapper for testing hooks
 */
export function createHookWrapper(
  options: WrapperOptions = {}
): React.FC<{ children: ReactNode }> {
  return createAllProvidersWrapper(options);
}
