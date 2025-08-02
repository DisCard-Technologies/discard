/**
 * API client for DisCard web application
 * Provides centralized API communication with proper error handling
 */

import axios from 'axios';
import { Card, CreateCardRequest, CardListRequest, CardDetailsResponse } from '../../../../packages/shared/src/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for authentication
apiClient.interceptors.request.use(
  (config: any) => {
    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: any) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response: any) => response,
  (error: any) => {
    // Handle common errors
    if (error.response?.status === 401) {
      // Redirect to login or clear auth
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

export class CardApiService {
  /**
   * Create a new card
   */
  static async createCard(request: CreateCardRequest): Promise<Card> {
    try {
      const response: any = await apiClient.post('/api/v1/cards', request);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  /**
   * Get list of cards
   */
  static async getCards(request: CardListRequest = {}): Promise<Card[]> {
    try {
      const params = new URLSearchParams();
      if (request.status) params.append('status', request.status);
      if (request.limit) params.append('limit', request.limit.toString());
      if (request.offset) params.append('offset', request.offset.toString());

      const response: any = await apiClient.get(`/api/v1/cards?${params}`);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  /**
   * Get card details
   */
  static async getCardDetails(cardId: string): Promise<CardDetailsResponse> {
    try {
      const response: any = await apiClient.get(`/api/v1/cards/${cardId}`);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  /**
   * Update card status
   */
  static async updateCardStatus(cardId: string, status: 'active' | 'paused'): Promise<Card> {
    try {
      const response: any = await apiClient.put(`/api/v1/cards/${cardId}/status`, { status });
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  /**
   * Delete a card
   */
  static async deleteCard(cardId: string): Promise<{ success: boolean; deletionProof: any }> {
    try {
      const response: any = await apiClient.delete(`/api/v1/cards/${cardId}`);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  /**
   * Handle API errors consistently
   */
  private static handleError(error: any): ApiError {
    if (error.response) {
      return {
        message: error.response.data?.message || 'An error occurred',
        status: error.response.status,
        code: error.response.data?.code,
      };
    } else if (error.request) {
      return {
        message: 'Network error - please check your connection',
        status: 0,
      };
    } else {
      return {
        message: error.message || 'An unexpected error occurred',
        status: 500,
      };
    }
  }
}

export default CardApiService;