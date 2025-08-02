/**
 * Card management state store for React Native mobile app
 * Provides card CRUD operations with privacy isolation and secure state management
 */

import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Card, CreateCardRequest, CardListRequest, CardDetailsResponse } from '@discard/shared';

// API base URL - should be moved to environment config
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export interface CardWithDetails extends Card {
  cardNumber?: string; // Only available temporarily after creation
  cvv?: string; // Only available temporarily after creation
  isLoading?: boolean;
  error?: string;
}

export interface CardsState {
  cards: CardWithDetails[];
  selectedCard: CardWithDetails | null;
  isLoading: boolean;
  error: string | null;
  createCardLoading: boolean;
  deleteCardLoading: { [cardId: string]: boolean };
}

type CardsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CARDS'; payload: CardWithDetails[] }
  | { type: 'ADD_CARD'; payload: CardWithDetails }
  | { type: 'UPDATE_CARD'; payload: { cardId: string; updates: Partial<CardWithDetails> } }
  | { type: 'REMOVE_CARD'; payload: string }
  | { type: 'SELECT_CARD'; payload: CardWithDetails | null }
  | { type: 'SET_CREATE_LOADING'; payload: boolean }
  | { type: 'SET_DELETE_LOADING'; payload: { cardId: string; loading: boolean } }
  | { type: 'CLEAR_SENSITIVE_DATA'; payload: string };

const initialState: CardsState = {
  cards: [],
  selectedCard: null,
  isLoading: false,
  error: null,
  createCardLoading: false,
  deleteCardLoading: {},
};

function cardsReducer(state: CardsState, action: CardsAction): CardsState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'SET_CARDS':
      return { ...state, cards: action.payload };
    
    case 'ADD_CARD':
      return { ...state, cards: [action.payload, ...state.cards] };
    
    case 'UPDATE_CARD':
      return {
        ...state,
        cards: state.cards.map(card =>
          card.cardId === action.payload.cardId
            ? { ...card, ...action.payload.updates }
            : card
        ),
        selectedCard: state.selectedCard?.cardId === action.payload.cardId
          ? { ...state.selectedCard, ...action.payload.updates }
          : state.selectedCard,
      };
    
    case 'REMOVE_CARD':
      return {
        ...state,
        cards: state.cards.filter(card => card.cardId !== action.payload),
        selectedCard: state.selectedCard?.cardId === action.payload ? null : state.selectedCard,
      };
    
    case 'SELECT_CARD':
      return { ...state, selectedCard: action.payload };
    
    case 'SET_CREATE_LOADING':
      return { ...state, createCardLoading: action.payload };
    
    case 'SET_DELETE_LOADING':
      return {
        ...state,
        deleteCardLoading: {
          ...state.deleteCardLoading,
          [action.payload.cardId]: action.payload.loading,
        },
      };
    
    case 'CLEAR_SENSITIVE_DATA':
      return {
        ...state,
        cards: state.cards.map(card =>
          card.cardId === action.payload
            ? { ...card, cardNumber: undefined, cvv: undefined }
            : card
        ),
        selectedCard: state.selectedCard?.cardId === action.payload
          ? { ...state.selectedCard, cardNumber: undefined, cvv: undefined }
          : state.selectedCard,
      };
    
    default:
      return state;
  }
}

// Context
const CardsContext = createContext<{
  state: CardsState;
  actions: CardsActions;
} | null>(null);

// Actions interface
export interface CardsActions {
  loadCards: (params?: CardListRequest) => Promise<void>;
  createCard: (cardData: CreateCardRequest) => Promise<CardWithDetails | null>;
  getCardDetails: (cardId: string) => Promise<CardDetailsResponse | null>;
  updateCardStatus: (cardId: string, status: Card['status']) => Promise<void>;
  deleteCard: (cardId: string) => Promise<boolean>;
  selectCard: (card: CardWithDetails | null) => void;
  clearSensitiveData: (cardId: string) => void;
  clearError: () => void;
}

// Provider component
export function CardsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cardsReducer, initialState);

  // Get auth token from secure storage (placeholder for now)
  const getAuthToken = async (): Promise<string | null> => {
    // TODO: Implement actual token retrieval from secure storage
    return 'mock-token';
  };

  // API helper function
  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const token = await getAuthToken();
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  };

  const actions: CardsActions = {
    loadCards: async (params?: CardListRequest) => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });

        const queryParams = new URLSearchParams();
        if (params?.status) queryParams.append('status', params.status);
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        if (params?.offset) queryParams.append('offset', params.offset.toString());

        const queryString = queryParams.toString();
        const endpoint = `/api/v1/cards${queryString ? `?${queryString}` : ''}`;
        
        const response = await apiCall(endpoint);
        dispatch({ type: 'SET_CARDS', payload: response.cards || [] });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load cards';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },

    createCard: async (cardData: CreateCardRequest): Promise<CardWithDetails | null> => {
      try {
        dispatch({ type: 'SET_CREATE_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });

        const response = await apiCall('/api/v1/cards', {
          method: 'POST',
          body: JSON.stringify(cardData),
        });

        const newCard: CardWithDetails = {
          ...response.card,
          cardNumber: response.cardNumber, // Temporary exposure
          cvv: response.cvv, // Temporary exposure
        };

        dispatch({ type: 'ADD_CARD', payload: newCard });

        // Auto-clear sensitive data after 60 seconds
        setTimeout(() => {
          actions.clearSensitiveData(newCard.cardId);
        }, 60000);

        return newCard;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create card';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        return null;
      } finally {
        dispatch({ type: 'SET_CREATE_LOADING', payload: false });
      }
    },

    getCardDetails: async (cardId: string): Promise<CardDetailsResponse | null> => {
      try {
        dispatch({ type: 'UPDATE_CARD', payload: { cardId, updates: { isLoading: true } } });

        const response = await apiCall(`/api/v1/cards/${cardId}`);
        
        // Update the card in state with fresh details
        dispatch({ 
          type: 'UPDATE_CARD', 
          payload: { 
            cardId, 
            updates: { 
              ...response.card, 
              isLoading: false 
            } 
          } 
        });

        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get card details';
        dispatch({ 
          type: 'UPDATE_CARD', 
          payload: { 
            cardId, 
            updates: { 
              isLoading: false, 
              error: errorMessage 
            } 
          } 
        });
        return null;
      }
    },

    updateCardStatus: async (cardId: string, status: Card['status']) => {
      try {
        dispatch({ type: 'UPDATE_CARD', payload: { cardId, updates: { isLoading: true } } });

        await apiCall(`/api/v1/cards/${cardId}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status }),
        });

        dispatch({ 
          type: 'UPDATE_CARD', 
          payload: { 
            cardId, 
            updates: { 
              status, 
              isLoading: false 
            } 
          } 
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to update card status';
        dispatch({ 
          type: 'UPDATE_CARD', 
          payload: { 
            cardId, 
            updates: { 
              isLoading: false, 
              error: errorMessage 
            } 
          } 
        });
      }
    },

    deleteCard: async (cardId: string): Promise<boolean> => {
      try {
        dispatch({ type: 'SET_DELETE_LOADING', payload: { cardId, loading: true } });

        const response = await apiCall(`/api/v1/cards/${cardId}`, {
          method: 'DELETE',
        });

        // Verify deletion proof if provided
        if (response.deletionProof) {
          console.log('Card deletion proof:', response.deletionProof);
        }

        dispatch({ type: 'REMOVE_CARD', payload: cardId });
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete card';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        return false;
      } finally {
        dispatch({ type: 'SET_DELETE_LOADING', payload: { cardId, loading: false } });
      }
    },

    selectCard: (card: CardWithDetails | null) => {
      dispatch({ type: 'SELECT_CARD', payload: card });
    },

    clearSensitiveData: (cardId: string) => {
      dispatch({ type: 'CLEAR_SENSITIVE_DATA', payload: cardId });
    },

    clearError: () => {
      dispatch({ type: 'SET_ERROR', payload: null });
    },
  };

  return (
    <CardsContext.Provider value={{ state, actions }}>
      {children}
    </CardsContext.Provider>
  );
}

// Hook to use cards context
export function useCards() {
  const context = useContext(CardsContext);
  if (!context) {
    throw new Error('useCards must be used within a CardsProvider');
  }
  return context;
}

// Hook for card operations
export function useCardOperations() {
  const { actions } = useCards();
  return actions;
}

// Hook for cards state
export function useCardsState() {
  const { state } = useCards();
  return state;
}