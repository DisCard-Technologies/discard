import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SecurityDashboard } from '../SecurityDashboard';
import { useCards } from '../../../../lib/hooks/useCards';

// Mock the useCards hook
jest.mock('../../../../lib/hooks/useCards');
const mockUseCards = useCards as jest.MockedFunction<typeof useCards>;

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock navigation
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    React.useEffect(callback, []);
  },
}));

describe('SecurityDashboard', () => {
  const mockGetSecurityData = jest.fn();
  const mockGetMFAStatus = jest.fn();

  const mockSecurityData = {
    incidents: [
      {
        incidentId: 'inc-1',
        eventType: 'velocity_exceeded',
        severity: 'high',
        detectedAt: '2024-01-15T10:00:00Z',
        actionTaken: 'alert',
        riskScore: 75,
        resolved: true
      },
      {
        incidentId: 'inc-2',
        eventType: 'amount_anomaly',
        severity: 'medium',
        detectedAt: '2024-01-14T15:30:00Z',
        actionTaken: 'none',
        riskScore: 50,
        resolved: false
      }
    ],
    metrics: {
      totalIncidents: 5,
      activeAlerts: 1,
      resolvedIncidents: 4,
      averageRiskScore: 35,
      lastIncidentDate: '2024-01-15T10:00:00Z'
    },
    notifications: [
      {
        notificationId: 'notif-1',
        type: 'fraud_alert',
        read: false,
        severity: 'medium',
        title: 'Suspicious Activity',
        message: 'Unusual transaction detected'
      },
      {
        notificationId: 'notif-2',
        type: 'security_update',
        read: true,
        severity: 'low',
        title: 'Security Update',
        message: 'New security features available'
      }
    ]
  };

  const mockMFAStatus = {
    enabled: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCards.mockReturnValue({
      getSecurityData: mockGetSecurityData,
      getMFAStatus: mockGetMFAStatus,
    } as any);

    mockGetSecurityData.mockResolvedValue(mockSecurityData);
    mockGetMFAStatus.mockResolvedValue(mockMFAStatus);
  });

  it('renders security dashboard with loading state initially', () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    expect(getByText('Loading security information...')).toBeTruthy();
  });

  it('loads and displays security data on mount', async () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(mockGetSecurityData).toHaveBeenCalledWith('card-123');
      expect(mockGetMFAStatus).toHaveBeenCalledWith('card-123');
    });

    await waitFor(() => {
      expect(getByText('Security Dashboard')).toBeTruthy();
      expect(getByText('Security Overview')).toBeTruthy();
    });
  });

  it('displays security metrics correctly', async () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('4')).toBeTruthy(); // Resolved incidents
      expect(getByText('1')).toBeTruthy(); // Active alerts
      expect(getByText('35')).toBeTruthy(); // Average risk score
    });
  });

  it('displays active fraud alerts', async () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Active Security Alerts')).toBeTruthy();
      expect(getByText('Suspicious Activity')).toBeTruthy();
      expect(getByText('Unusual transaction detected')).toBeTruthy();
    });
  });

  it('displays recent security incidents', async () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Recent Security Activity')).toBeTruthy();
      expect(getByText('Velocity Exceeded')).toBeTruthy();
      expect(getByText('Amount Anomaly')).toBeTruthy();
      expect(getByText('75/100')).toBeTruthy(); // Risk score
      expect(getByText('50/100')).toBeTruthy(); // Risk score
    });
  });

  it('shows MFA status correctly when enabled', async () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Multi-Factor Authentication')).toBeTruthy();
      expect(getByText('Enabled - Extra security for transactions')).toBeTruthy();
    });
  });

  it('shows MFA status correctly when disabled', async () => {
    mockGetMFAStatus.mockResolvedValue({ enabled: false });

    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Add extra security to your account')).toBeTruthy();
    });
  });

  it('handles pull-to-refresh', async () => {
    const { getByTestId } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByTestId('security-dashboard-scroll')).toBeTruthy();
    });

    const scrollView = getByTestId('security-dashboard-scroll');
    fireEvent(scrollView, 'refresh');

    await waitFor(() => {
      expect(mockGetSecurityData).toHaveBeenCalledTimes(2); // Once on mount, once on refresh
    });
  });

  it('handles security setting navigation', async () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Multi-Factor Authentication')).toBeTruthy();
    });

    fireEvent.press(getByText('Multi-Factor Authentication'));
    // Navigation would be tested with proper navigation mocks
  });

  it('displays security tips section', async () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Security Tips')).toBeTruthy();
      expect(getByText('Enable MFA for additional protection on high-risk transactions')).toBeTruthy();
      expect(getByText('Monitor your transactions regularly for suspicious activity')).toBeTruthy();
      expect(getByText('Freeze your card immediately if you suspect fraud')).toBeTruthy();
    });
  });

  it('handles card freeze control integration', async () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Card Controls')).toBeTruthy();
      // CardFreezeControl component should be rendered
    });
  });

  it('shows error when security data fails to load', async () => {
    mockGetSecurityData.mockRejectedValue(new Error('Network error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    render(<SecurityDashboard cardId="card-123" />);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to load security information'
      );
    });

    consoleSpy.mockRestore();
  });

  it('handles notification action', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Suspicious Activity')).toBeTruthy();
    });

    // This would trigger handleNotificationAction
    // In actual implementation, this would involve pressing action buttons on FraudAlert
    
    consoleSpy.mockRestore();
  });

  it('handles notification dismiss', async () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Suspicious Activity')).toBeTruthy();
    });

    // Notification dismissal would trigger loadSecurityData again
    // This would be tested through FraudAlert component interaction
  });

  it('handles empty security data gracefully', async () => {
    mockGetSecurityData.mockResolvedValue({
      incidents: [],
      metrics: {
        totalIncidents: 0,
        activeAlerts: 0,
        resolvedIncidents: 0,
        averageRiskScore: 0
      },
      notifications: []
    });

    const { getByText, queryByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('Security Dashboard')).toBeTruthy();
      expect(getByText('0')).toBeTruthy(); // Should show zero metrics
      expect(queryByText('Active Security Alerts')).toBeNull(); // No alerts section
      expect(queryByText('Recent Security Activity')).toBeNull(); // No incidents section
    });
  });

  it('filters fraud alerts from notifications correctly', async () => {
    const mixedNotifications = [
      ...mockSecurityData.notifications,
      {
        notificationId: 'notif-3',
        type: 'system_update', // Not fraud_alert
        read: false,
        severity: 'low',
        title: 'System Update',
        message: 'System maintenance scheduled'
      }
    ];

    mockGetSecurityData.mockResolvedValue({
      ...mockSecurityData,
      notifications: mixedNotifications
    });

    const { getByText, queryByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      // Should only show fraud alerts
      expect(getByText('Suspicious Activity')).toBeTruthy();
      expect(queryByText('System Update')).toBeNull();
    });
  });

  it('formats date correctly in metrics', async () => {
    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      // Should format the last incident date
      expect(getByText(/Jan 15/)).toBeTruthy(); // Formatted date
    });
  });

  it('shows "None" when no last incident date', async () => {
    mockGetSecurityData.mockResolvedValue({
      ...mockSecurityData,
      metrics: {
        ...mockSecurityData.metrics,
        lastIncidentDate: undefined
      }
    });

    const { getByText } = render(
      <SecurityDashboard cardId="card-123" />
    );

    await waitFor(() => {
      expect(getByText('None')).toBeTruthy();
    });
  });
});