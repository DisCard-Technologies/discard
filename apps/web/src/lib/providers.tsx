'use client';

/**
 * Application providers for React Query and other global state
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from './stubs';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider>
      {children}
    </QueryClientProvider>
  );
}