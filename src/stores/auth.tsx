/**
 * Authentication state store for React Native mobile app
 * Manages user authentication, tokens, and session state
 *
 * @deprecated This store uses the legacy Express/Supabase API.
 * Use `authConvex.tsx` instead for the new Convex + Passkey authentication.
 *
 * Migration guide:
 * - Replace `useAuth()` with `useConvexAuth()` from authConvex.tsx
 * - Replace `login()` with passkey-based `authenticate()` or `register()`
 * - Remove manual token management (Convex handles this automatically)
 *
 * This file will be removed after the Convex migration is complete.
 */

import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3001';

export interface User {
  id: string;
  email: string;
  username?: string;
  emailVerified: boolean;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; accessToken: string; refreshToken: string } }
  | { type: 'LOGOUT' }
  | { type: 'REFRESH_TOKEN'; payload: { accessToken: string } }
  | { type: 'SET_USER'; payload: User };

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
        isAuthenticated: true,
        error: null,
      };
    
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      };
    
    case 'REFRESH_TOKEN':
      return { ...state, accessToken: action.payload.accessToken };
    
    case 'SET_USER':
      return { ...state, user: action.payload };
    
    default:
      return state;
  }
}

// Context
const AuthContext = createContext<{
  state: AuthState;
  actions: AuthActions;
} | null>(null);

// Actions interface
export interface AuthActions {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  register: (email: string, password: string, username?: string) => Promise<boolean>;
  refreshToken: () => Promise<boolean>;
  getAuthToken: () => Promise<string | null>;
  checkAuthStatus: () => Promise<void>;
}

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
};

// Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check auth status on mount
  useEffect(() => {
    actions.checkAuthStatus();
  }, []);

  const actions: AuthActions = {
    login: async (email: string, password: string): Promise<boolean> => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });

        const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Login failed');
        }

        const response_data = await response.json();
        const data = response_data.data;

        // Validate required fields before storing
        if (!data.accessToken || !data.refreshToken || !data.user) {
          throw new Error('Invalid response from server: missing required fields');
        }

        // Store tokens and user data securely
        await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, String(data.accessToken));
        await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, String(data.refreshToken));
        await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(data.user));

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          },
        });

        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to login';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        return false;
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },

    logout: async (): Promise<void> => {
      try {
        // Clear stored data
        await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
        await SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
        await SecureStore.deleteItemAsync(STORAGE_KEYS.USER);

        dispatch({ type: 'LOGOUT' });
      } catch (error) {
        console.error('Error during logout:', error);
        // Still dispatch logout even if storage clear fails
        dispatch({ type: 'LOGOUT' });
      }
    },

    register: async (email: string, password: string, username?: string): Promise<boolean> => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });

        const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password, username }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Registration failed');
        }

        const response_data = await response.json();
        const data = response_data.data;

        // Validate required fields before storing
        if (!data.accessToken || !data.refreshToken || !data.user) {
          throw new Error('Invalid response from server: missing required fields');
        }

        // Store tokens and user data securely
        await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, String(data.accessToken));
        await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, String(data.refreshToken));
        await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(data.user));

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          },
        });

        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to register';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        return false;
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },

    refreshToken: async (): Promise<boolean> => {
      try {
        const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
          throw new Error('Token refresh failed');
        }

        const data = await response.json();

        // Update stored access token
        await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);

        dispatch({
          type: 'REFRESH_TOKEN',
          payload: { accessToken: data.accessToken },
        });

        return true;
      } catch (error) {
        console.error('Token refresh error:', error);
        // If refresh fails, logout
        await actions.logout();
        return false;
      }
    },

    getAuthToken: async (): Promise<string | null> => {
      try {
        // First check in-memory state
        if (state.accessToken) {
          return state.accessToken;
        }

        // Then check storage
        const storedToken = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
        return storedToken;
      } catch (error) {
        console.error('Error retrieving auth token:', error);
        return null;
      }
    },

    checkAuthStatus: async (): Promise<void> => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });

        const accessToken = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
        const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
        const userStr = await SecureStore.getItemAsync(STORAGE_KEYS.USER);

        if (accessToken && refreshToken && userStr) {
          const user = JSON.parse(userStr);
          
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user,
              accessToken,
              refreshToken,
            },
          });
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
  };

  return (
    <AuthContext.Provider value={{ state, actions }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context.state;
}

// Hook to use auth operations
export function useAuthOperations() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthOperations must be used within an AuthProvider');
  }
  return context.actions;
}