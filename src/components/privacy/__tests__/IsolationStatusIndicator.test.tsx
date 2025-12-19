import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { IsolationStatusIndicator } from '../IsolationStatusIndicator';

// Mock fetch
global.fetch = jest.fn();

describe('IsolationStatusIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it('should render loading state initially', () => {
    const { getByTestId } = render(
      <IsolationStatusIndicator cardId="test-card-1" />
    );

    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('should display privacy protected status when isolated', async () => {
    const mockResponse = {
      isolated: true,
      lastVerified: new Date().toISOString(),
      riskLevel: 'low',
      violationCount: 0
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const { getByText, queryByTestId } = render(
      <IsolationStatusIndicator cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeNull();
      expect(getByText('Privacy Protected')).toBeTruthy();
    });
  });

  it('should display warning for medium risk level', async () => {
    const mockResponse = {
      isolated: true,
      lastVerified: new Date().toISOString(),
      riskLevel: 'medium',
      violationCount: 2
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const { getByText } = render(
      <IsolationStatusIndicator cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByText('Privacy Warning')).toBeTruthy();
    });
  });

  it('should display error for high risk level', async () => {
    const mockResponse = {
      isolated: false,
      lastVerified: new Date().toISOString(),
      riskLevel: 'high',
      violationCount: 10
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const { getByText } = render(
      <IsolationStatusIndicator cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByText('Privacy Risk Detected')).toBeTruthy();
    });
  });

  it('should show violation count badge when violations exist', async () => {
    const mockResponse = {
      isolated: true,
      lastVerified: new Date().toISOString(),
      riskLevel: 'medium',
      violationCount: 5
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const { getByText } = render(
      <IsolationStatusIndicator cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByText('5')).toBeTruthy(); // Violation count
    });
  });

  it('should handle API errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { getByText } = render(
      <IsolationStatusIndicator cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByText('Privacy Check Failed')).toBeTruthy();
    });
  });

  it('should refresh status periodically', async () => {
    jest.useFakeTimers();

    const mockResponse = {
      isolated: true,
      lastVerified: new Date().toISOString(),
      riskLevel: 'low',
      violationCount: 0
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    render(<IsolationStatusIndicator cardId="test-card-1" />);

    // Initial call
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // Fast-forward 1 minute
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    // Should make another call
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    jest.useRealTimers();
  });

  it('should format last verified time correctly', async () => {
    const mockResponse = {
      isolated: true,
      lastVerified: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
      riskLevel: 'low',
      violationCount: 0
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const { getByText } = render(
      <IsolationStatusIndicator cardId="test-card-1" />
    );

    await waitFor(() => {
      expect(getByText('Verified 2m ago')).toBeTruthy();
    });
  });

  it('should call onStatusChange callback when status updates', async () => {
    const mockCallback = jest.fn();
    const mockResponse = {
      isolated: true,
      lastVerified: new Date().toISOString(),
      riskLevel: 'low',
      violationCount: 0
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    render(
      <IsolationStatusIndicator 
        cardId="test-card-1" 
        onStatusChange={mockCallback}
      />
    );

    await waitFor(() => {
      expect(mockCallback).toHaveBeenCalledWith(mockResponse);
    });
  });

  it('should include proper authorization headers', async () => {
    const mockResponse = {
      isolated: true,
      lastVerified: new Date().toISOString(),
      riskLevel: 'low',
      violationCount: 0
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    render(<IsolationStatusIndicator cardId="test-card-1" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/privacy/isolation/verify/test-card-1'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-auth-token',
            'X-Card-Context': 'test-card-1'
          })
        })
      );
    });
  });
});