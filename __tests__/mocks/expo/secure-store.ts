/**
 * Expo SecureStore Mock
 *
 * Mocks expo-secure-store for testing secure storage operations.
 */

const secureStorage = new Map<string, string>();

export const mockSecureStore = {
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureStorage.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => {
    return secureStorage.get(key) ?? null;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    secureStorage.delete(key);
  }),
  isAvailableAsync: jest.fn(async () => true),
};

// Helper to clear storage between tests
export const clearSecureStorage = () => {
  secureStorage.clear();
};

// Helper to pre-populate storage for tests
export const setSecureStorageItem = (key: string, value: string) => {
  secureStorage.set(key, value);
};

// Helper to get current storage state (for assertions)
export const getSecureStorageState = () => {
  return Object.fromEntries(secureStorage);
};

jest.mock('expo-secure-store', () => mockSecureStore);
