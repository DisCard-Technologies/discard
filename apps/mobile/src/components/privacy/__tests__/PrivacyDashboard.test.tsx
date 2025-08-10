import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { PrivacyDashboard } from '../PrivacyDashboard';

// Mock fetch
global.fetch = jest.fn();

describe('PrivacyDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it('should render loading state initially', () => {
    const { getByText } = render(
      <PrivacyDashboard cardId="test-card-1" />
    );

    expect(getByText('Loading privacy metrics...')).toBeTruthy();
  });

  it('should display privacy metrics when loaded', async () => {
    const mockIsolationResponse = {
      continuousIsolation: {
        verified: true,
        lastCheck: new Date().toISOString(),
        violations: 0
      }
    };

    const mockBudgetResponse = {
      budgetUtilization: '25.0%',
      remainingBudget: 7.5
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockIsolationResponse
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockBudgetResponse
      });

    const { getByText } = render(
      <PrivacyDashboard cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByText('Privacy Protection')).toBeTruthy();
      expect(getByText('100%')).toBeTruthy(); // Isolation score
      expect(getByText('COMPLIANT')).toBeTruthy();
    });
  });

  it('should show privacy features as active', async () => {
    const mockIsolationResponse = {
      continuousIsolation: {
        verified: true,
        violations: 0
      }
    };

    const mockBudgetResponse = {
      budgetUtilization: '25.0%'
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockIsolationResponse
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockBudgetResponse
      });

    const { getByText } = render(
      <PrivacyDashboard cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByText('Privacy Features Active')).toBeTruthy();
      expect(getByText('Transaction Isolation')).toBeTruthy();
      expect(getByText('Differential Privacy Analytics')).toBeTruthy();
      expect(getByText('Correlation Prevention')).toBeTruthy();
      expect(getByText('Continuous Monitoring')).toBeTruthy();
    });
  });

  it('should handle refresh functionality', async () => {
    const mockResponse = {
      continuousIsolation: { verified: true, violations: 0 }
    };

    (global.fetch as jest.Mock)
      .mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

    const { getByTestId } = render(
      <PrivacyDashboard cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByTestId('privacy-dashboard-scroll')).toBeTruthy();
    });

    // Simulate pull-to-refresh
    const scrollView = getByTestId('privacy-dashboard-scroll');
    fireEvent(scrollView, 'refresh');

    // Should make additional API calls
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(4); // 2 initial + 2 refresh
    });
  });

  it('should display error state when API fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

    const { getByText, getByTestId } = render(
      <PrivacyDashboard cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByText('Unable to load privacy metrics')).toBeTruthy();
      expect(getByTestId('retry-button')).toBeTruthy();
    });
  });

  it('should retry on error', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ continuousIsolation: { verified: true, violations: 0 } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgetUtilization: '25.0%' })
      });

    const { getByTestId, getByText } = render(
      <PrivacyDashboard cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByTestId('retry-button')).toBeTruthy();
    });

    fireEvent.press(getByTestId('retry-button'));

    await waitFor(() => {
      expect(getByText('Privacy Protection')).toBeTruthy();
    });
  });

  it('should call onNavigateToDetails when info button pressed', async () => {
    const mockNavigate = jest.fn();
    
    const mockResponse = {
      continuousIsolation: { verified: true, violations: 0 }
    };

    (global.fetch as jest.Mock)
      .mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

    const { getByTestId } = render(
      <PrivacyDashboard 
        cardId="test-card-1" 
        onNavigateToDetails={mockNavigate}
      />
    );

    await waitFor(() => {
      expect(getByTestId('privacy-info-button')).toBeTruthy();
    });

    fireEvent.press(getByTestId('privacy-info-button'));

    expect(mockNavigate).toHaveBeenCalled();
  });

  it('should display appropriate risk colors', async () => {
    const mockHighRiskResponse = {
      continuousIsolation: {
        verified: false,
        violations: 10
      }
    };

    (global.fetch as jest.Mock)
      .mockResolvedValue({
        ok: true,
        json: async () => mockHighRiskResponse
      });

    const { getByText } = render(
      <PrivacyDashboard cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByText('75%')).toBeTruthy(); // Degraded isolation score
    });
  });

  it('should format audit date correctly', async () => {
    const yesterday = new Date(Date.now() - 86400000);
    
    const mockResponse = {
      continuousIsolation: { verified: true, violations: 0 }
    };

    (global.fetch as jest.Mock)
      .mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

    const { getByText } = render(
      <PrivacyDashboard cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByText(/Last privacy audit:/)).toBeTruthy();
    });
  });
});