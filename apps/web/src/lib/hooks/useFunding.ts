'use client';

/**
 * React hooks for funding operations in the web app
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  AccountFundingRequest, 
  CardAllocationRequest, 
  CardTransferRequest,
  AccountBalance,
  FundingTransaction,
  BalanceNotificationThreshold,
  FundingRequestOptions
} from '@discard/shared';

// API base URL - should be moved to environment config
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// API helper function
async function apiCall(endpoint: string, options: RequestInit = {}) {
  // TODO: Get actual auth token from auth context
  const token = 'mock-token';
  
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
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// Hook to get account balance
export function useAccountBalance() {
  return useQuery({
    queryKey: ['funding', 'balance'],
    queryFn: async (): Promise<{
      balance: AccountBalance;
      notificationThresholds: BalanceNotificationThreshold;
    }> => {
      const response = await apiCall('/api/v1/funding/balance');
      return response.data;
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
}

// Hook to get funding transactions
export function useFundingTransactions(options: FundingRequestOptions = {}) {
  const queryParams = new URLSearchParams();
  if (options.status) queryParams.append('status', options.status);
  if (options.type) queryParams.append('type', options.type);
  if (options.limit) queryParams.append('limit', options.limit.toString());
  if (options.offset) queryParams.append('offset', options.offset.toString());
  if (options.startDate) queryParams.append('startDate', options.startDate);
  if (options.endDate) queryParams.append('endDate', options.endDate);

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/funding/transactions${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: ['funding', 'transactions', options],
    queryFn: async (): Promise<FundingTransaction[]> => {
      const response = await apiCall(endpoint);
      return response.data || [];
    },
    staleTime: 10000, // 10 seconds
  });
}

// Hook to fund account
export function useFundAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: AccountFundingRequest): Promise<FundingTransaction> => {
      const response = await apiCall('/api/v1/funding/account', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      return response.data.transaction;
    },
    onSuccess: () => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: ['funding', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['funding', 'transactions'] });
    },
  });
}

// Hook to allocate to card
export function useAllocateToCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CardAllocationRequest): Promise<FundingTransaction> => {
      const response = await apiCall(`/api/v1/funding/card/${request.cardId}`, {
        method: 'POST',
        body: JSON.stringify({ amount: request.amount }),
      });
      return response.data.transaction;
    },
    onSuccess: () => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: ['funding', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['funding', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cards'] }); // Also invalidate cards data
    },
  });
}

// Hook to transfer between cards
export function useTransferBetweenCards() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CardTransferRequest): Promise<FundingTransaction> => {
      const response = await apiCall('/api/v1/funding/transfer', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      return response.data.transaction;
    },
    onSuccess: () => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: ['funding', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cards'] }); // Also invalidate cards data
    },
  });
}

// Hook to update notification thresholds
export function useUpdateNotificationThresholds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<BalanceNotificationThreshold, 'userId'>>): Promise<BalanceNotificationThreshold> => {
      const response = await apiCall('/api/v1/funding/notifications', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch balance data
      queryClient.invalidateQueries({ queryKey: ['funding', 'balance'] });
    },
  });
}

// Combined hook for funding overview
export function useFunding() {
  const { 
    data: balanceData, 
    isLoading: isLoadingBalance, 
    error: balanceError,
    refetch: refetchBalance 
  } = useAccountBalance();

  const { 
    data: recentTransactions, 
    isLoading: isLoadingTransactions, 
    error: transactionsError 
  } = useFundingTransactions({ limit: 5 });

  return {
    accountBalance: balanceData?.balance || null,
    notificationThresholds: balanceData?.notificationThresholds || null,
    recentTransactions: recentTransactions || [],
    isLoading: isLoadingBalance || isLoadingTransactions,
    error: balanceError || transactionsError,
    refetch: () => {
      refetchBalance();
    },
  };
}